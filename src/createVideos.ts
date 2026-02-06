import { parse } from 'iso8601-duration';
import { bot, log } from './util/bot';
import mediaTemplate from '../templates/media';
import { fetchAllVideos } from './util/youtube';
import { cleanTitle, FALSE_SUBPAGE_REASON } from './util/titleinfo';

let count = 0;
async function main() {
	let lastCreated: Date | undefined = undefined;
	const file = Bun.file('lastCreated.txt');
	const exists = await file.exists();
	if (exists) {
		const content = await file.text();
		if (content) {
			lastCreated = new Date(content);
		}
	}
	const utcStr = lastCreated ? lastCreated.toISOString() : 'None';
	const localStr = lastCreated ? ` (${lastCreated.toLocaleString()})` : '';
	log(`[I] Last created video date: ${utcStr}${localStr}`);
	const videos = (await fetchAllVideos(lastCreated))
		.filter(video => {
			// Return only videos newer than lastCreated
			if (lastCreated && video.snippet?.publishedAt) {
				const publishedAt = new Date(video.snippet.publishedAt);
				return publishedAt > lastCreated;
			}
			return true;
		}).sort((a, b) => {
			// Sort by published date, oldest first
			const dateA = a.snippet?.publishedAt ? new Date(a.snippet.publishedAt).getTime() : 0;
			const dateB = b.snippet?.publishedAt ? new Date(b.snippet.publishedAt).getTime() : 0;
			return dateA - dateB;
		});
	if (videos.length === 0) {
		log('[W] No videos found in total.');
		return;
	}
	log(`[S] Total new videos to process: ${videos.length}`);

	const siteInfo = await bot.query({
		meta: 'siteinfo',
		siprop: 'namespaces',
	});
	const namespaces = Object.values<NamespaceInfo>(siteInfo.query.namespaces).map(ns => ns.name);

	const titleInfoCache: Record<string, VideoTitleInfo> = {};

	const duplicateTitles = videos.reduce((acc, video) => {
		const id = video.id || '';
		const titleInfo = titleInfoCache[id] || cleanTitle(namespaces, video.snippet?.title);
		
		if (!titleInfoCache[id]) {
			titleInfoCache[id] = titleInfo;
		}
		if (titleInfo.title === '') return acc;

		if (!acc.get(titleInfo.title)) {
			acc.set(titleInfo.title, []);
		}
		acc.get(titleInfo.title)?.push(video.id || '');

		return acc;
	}, new Map<string, string[]>());

	if (duplicateTitles.size > 0) {
		duplicateTitles.forEach((videoIds, title) => {
			if (videoIds.length > 1) {
				log(`[W] Duplicate title detected: ${title}`);
				videoIds.forEach(vid => {
					log(`[W]    - https://www.youtube.com/watch?v=${vid}`);
				});
			}
		});
	}

	// Create pages for videos
	for (const video of videos) {
		if (count >= 5) {
			break;
		}
		count++;
		log('');
		const id = video.id || '';
		const url = `https://www.youtube.com/watch?v=${id}`;
		const titleInfo = titleInfoCache[id] || cleanTitle(namespaces, video.snippet?.title);
		if (!titleInfoCache[id]) {
			titleInfoCache[id] = titleInfo;
		}
		if (titleInfo.title === '') {
			log(`[W] Skipping video with empty title: ${url}`);
			continue;
		}
		if (duplicateTitles.get(titleInfo.title)?.length! > 1) {
			log(`[W] Skipping video with duplicate title: ${titleInfo.title} (${url})`);
			continue;
		}

		// Skip existing pages
		try {
			const page = new bot.Page(titleInfo.title);
			const exists = await page.exists();
			if (exists) {
				log(`[W] Skipping video with existing page: ${titleInfo.title} (${url})`);
				continue;
			}
		} catch (error) {
			log(`[E] Error checking existence of page: ${titleInfo.title}`);
			log(error);
			continue;
		}
		
		// Format data
		let duration = '';
		if (video.contentDetails?.duration) {
			const parsed = parse(video.contentDetails.duration);
			const hrs = (parsed.hours || 0).toString().padStart(2, '0');
			const mins = (parsed.minutes || 0).toString().padStart(2, '0');
			const secs = (parsed.seconds || 0).toString().padStart(2, '0');
			duration = `${hrs}:${mins}:${secs}`;
		}
		let date = '';
		if (video.snippet?.publishedAt) {
			date = (new bot.Date(video.snippet.publishedAt)).format('D MMMM YYYY', 'utc');
		}
		let description = '';
		if (video.snippet?.description) {
			description = video.snippet.description
				.replace(/\u200E/g, '') // Remove any LRM characters
				.replace(/[“”]/g, '"') // Replace curly quotes with straight quotes
				.replace(/[‘’]/g, "'") // Replace curly apostrophes with straight apostrophes
    		.replace(/(?<!\n)\n(?!\n)/g, '<br>\n') // Add br tags for single newlines
    		.replace(/\n([#*])/g, '\n<nowiki/>$1') // Prevent lists from being created
		}

		// Create page content
		let content = mediaTemplate;
		content = content.replace(/NAME/g, titleInfo.originalTitle)
			.replace(/MEDIA/g, titleInfo.mediaTitle)
			.replace(/DATE/g, date)
			.replace(/TYPE/g, 'video')
			.replace(/DURATION/g, duration)
			.replace(/YOUTUBE_URL/g, url)
			.replace(/DESCRIPTION/g, description);

		if (titleInfo.restrictedTitleReasons.length > 0) {
			const restrictionStr = titleInfo.restrictedTitleReasons.join('; ');
			log(`[W] Title "${titleInfo.originalTitle}" has restrictions: ${restrictionStr}`);
			content += '\n{{Restricted title'
						+ '|' + titleInfo.restrictedTitleReasons.join('|')
						+ (titleInfo.restrictedTitleReasons.includes(FALSE_SUBPAGE_REASON) ? '|subpage=1' : '')
						+ '}}';
			if (titleInfo.originalTitle !== titleInfo.title) {
				content = `{{DISPLAYTITLE:${titleInfo.originalTitle}}}\n` + content;
			}
		}

		// Create page
		log(`[I] Creating page for video: ${titleInfo.title} (${url})`);
		try {
			if (process.env.NODE_ENV === 'production') {
				await bot.create(titleInfo.title, content, `Automated creation of page for YouTube video ${url}`);
			} else {
				log(`[S] (Simulated) Created page: ${titleInfo.title}`);
			}
		} catch (error) {
			log(`[E] Error creating page for video: ${titleInfo.title}`);
			log(error);
			continue;
		}

		// Upload thumbnail image
		log(`[I] Uploading video's thumbnail image: ${titleInfo.mediaTitle}`);
		let imageUrl = video.snippet?.thumbnails?.maxres?.url || video.snippet?.thumbnails?.default?.url;
		if (imageUrl) {
			imageUrl = imageUrl.replace(/\/default\.jpg$/, '/maxresdefault.jpg');
			const file = Bun.file('next_thumbnail.jpg');
			try {
				const result = await fetch(imageUrl);
				await Bun.write(file, result);
				if (process.env.NODE_ENV === 'production') {
					await bot.upload(`File:${titleInfo.mediaTitle}.jpg`, 'next_thumbnail.jpg', `{{Media thumbnail|link=${imageUrl}}}`, {
						ignorewarning: false,
						comment: `Automated upload of thumbnail image for YouTube video ${url}`,
					});
				} else {
					log(`[S] (Simulated) Uploaded image: ${imageUrl}`);
				}
				await file.delete();
			} catch (error) {
				if (error instanceof Error && error.message.includes('already exists')) {
					log(`[I] Image already exists: ${imageUrl}`);
					await file.delete();
					continue;
				}
				log(`[E] Error uploading image: ${imageUrl}`);
				log(error);
				await file.delete();
				continue;
			}
		}

		if (video.snippet?.publishedAt) {
			const publishedAt = new Date(video.snippet.publishedAt);
			await file.write(publishedAt.toISOString());
		}

		await Bun.sleep(3000);
	}
}

main().then(() => {
	log('[S] Finished creating video pages.');
	process.exit();
});
