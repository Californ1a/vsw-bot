import { parse } from 'iso8601-duration';
import sleep from './util/sleep';
import { bot, log } from './util/bot';
import mediaTemplate from '../templates/media';
import { fetchAllVideos } from './util/youtube';
import { cleanTitle, FALSE_SUBPAGE_REASON } from './util/titleinfo';
import type { youtube_v3 } from '@googleapis/youtube';
import fs from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import readline from 'node:readline/promises';

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

const LAST_CREATED_FILENAME = 'lastCreated.txt';
const TIME_BETWEEN_PAGES = 3;
const MAX_PAGES = 10;
let count = 0;
let totalDone = 0;

async function continueProcessing(prompt: string) {
	while (true) {
		const answer = await rl.question(prompt);
		if (!answer) continue;

		const lc = answer.toLowerCase();
		const exitLines = ['n', 'no'];
		const continueLines = ['y', 'yes'];
		if (exitLines.includes(lc)) {
			return false;
		} else if (continueLines.includes(lc)) {
			count = 0;
			return true;
		}
	}
}

async function saveLastTime(video: youtube_v3.Schema$Video) {
	if (video.snippet?.publishedAt) {
		const publishedAt = new Date(video.snippet.publishedAt);
		try {
			const controller = new AbortController();
			const { signal } = controller;
			const data = new Uint8Array(Buffer.from(publishedAt.toISOString()));
			await fs.writeFile(LAST_CREATED_FILENAME, data, { signal });
		} catch (error) {
			log('[E] Could not save last created time:');
			log(error);
			process.exit(1);
		}
	}
}

async function createPage(video: youtube_v3.Schema$Video, titleInfo: VideoTitleInfo, url: string) {
	log(`[I] Creating page for video: ${titleInfo.title} (${url})`);
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
	try {
		if (process.env.NODE_ENV === 'production') {
			await bot.create(titleInfo.title, content, `Automated creation of page for YouTube video ${url}`);
		} else {
			log(`[S] (Simulated) Created page: ${titleInfo.title}`);
		}
	} catch (error) {
		log(`[E] Error creating page for video: ${titleInfo.title}`);
		log(error);
		process.exit(1);
	}
}

async function uploadThumbnail(video: youtube_v3.Schema$Video, titleInfo: VideoTitleInfo, url: string) {
	// Upload thumbnail image
	log(`[I] Uploading video's thumbnail image: ${titleInfo.mediaTitle}`);
	const thumbs = video.snippet?.thumbnails || {};
	let best: youtube_v3.Schema$Thumbnail | undefined;
	let bestResolution = 0;
	for (const value of Object.values(thumbs)) {
		const thumb = value as youtube_v3.Schema$Thumbnail | undefined;
		if (!thumb?.url) continue;

		const w = thumb.width || 0;
		const h = thumb.height || 0;
		const resolution = w * h;
		if (resolution > bestResolution) {
			bestResolution = resolution;
			best = thumb;
		}
	}
	if (!best?.url) return;
	
	const imageUrl = best.url;
	const tempFilename = `thumbnail-${Date.now()}.jpg`;
	try {
		const img = await fetch(imageUrl);
		const bytes = await img.bytes()

		const controller = new AbortController();
		const { signal } = controller;
		await fs.writeFile(tempFilename, bytes, { signal });
		if (process.env.NODE_ENV === 'production') {
			await bot.upload(tempFilename, `${titleInfo.mediaTitle}.jpg`, `{{Media thumbnail|link=${imageUrl}}}`, {
				comment: `Automated upload of thumbnail image for YouTube video ${url}`,
			});
		} else {
			log(`[S] (Simulated) Uploaded image: ${imageUrl}`);
		}
	} catch (error) {
		log(`[E] Error uploading image: ${imageUrl}`);
		log(error);
		process.exit(1);
	}

	try {
		await fs.rm(tempFilename);
	} catch (error) {
		log(`[E] Error deleting temporary file: ${tempFilename}`);
		log(error);
		process.exit(1);
	}
}

async function main() {
	let lastCreated: Date | undefined = undefined;
	try {
		const content = await fs.readFile(LAST_CREATED_FILENAME, { encoding: 'utf8' });
		lastCreated = new Date(content.trim());
	} catch (error) {
		// Ignore
	}
	const utcStr = lastCreated ? lastCreated.toISOString() : 'None';
	const localStr = lastCreated ? ` (${lastCreated.toLocaleString()})` : '';
	log(`[I] Last created video date: ${utcStr}${localStr}`);
	const allVideos = await fetchAllVideos(lastCreated);
	const videos = allVideos.filter(video => {
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

	const duplicateTitles = allVideos.reduce((acc, video) => {
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
		if (count >= MAX_PAGES) {
			log('');
			const nextBatch = Math.min(videos.length - totalDone, MAX_PAGES);
			const prompt = `Processed ${totalDone}/${videos.length} videos. Create ${nextBatch} more? (y/n): `;
			const keepGoing = await continueProcessing(prompt);
			if (!keepGoing) {
				break;
			}
		}
		log('');
		const id = video.id || '';
		const url = `https://www.youtube.com/watch?v=${id}`;
		const titleInfo = titleInfoCache[id] || cleanTitle(namespaces, video.snippet?.title);
		if (!titleInfoCache[id]) {
			titleInfoCache[id] = titleInfo;
		}
		if (titleInfo.title === '') {
			log(`[W] Skipping video with empty title: ${url}`);
			await saveLastTime(video);
			continue;
		}
		if (duplicateTitles.get(titleInfo.title)?.length! > 1) {
			log(`[W] Skipping video with duplicate title: ${titleInfo.title} (${url})`);
			await saveLastTime(video);
			continue;
		}

		// Check page existance
		let didCreate = false;
		try {
			const page = new bot.Page(titleInfo.title);
			const exists = await page.exists();
			if (exists) {
				const categories = await page.categories();
				if (categories.includes('Category:Videos')) {
					log(`[W] Page for video already exists: ${titleInfo.title} (${url})`);
				} else {
					titleInfo.title = titleInfo.title + ' (video)';
					titleInfo.mediaTitle = titleInfo.mediaTitle + ' (video)';
					const newPage = new bot.Page(titleInfo.title);
					const newExists = await newPage.exists();
					if (newExists) {
						log(`[W] Page for video already exists: ${titleInfo.title} (${url})`);
					} else {
						await createPage(video, titleInfo, url);
						didCreate = true;
					}
				}
			} else {
				await createPage(video, titleInfo, url);
				didCreate = true;
			}
		} catch (error) {
			log(`[E] Error checking existence of page: ${titleInfo.title}`);
			log(error);
			process.exit(1);
		}

		let didUpload = false;
		// Check file page existance
		try {
			const page = new bot.Page(`File:${titleInfo.mediaTitle}.jpg`);
			const exists = await page.exists();
			if (exists) {
				log(`[W] File page already exists: File:${titleInfo.mediaTitle}.jpg (${url})`);
			} else {
				await uploadThumbnail(video, titleInfo, url);
				didUpload = true;
			}
		} catch (error) {
			log(`[E] Error checking existence of file page: File:${titleInfo.mediaTitle}.jpg`);
			log(error);
			process.exit(1);
		}

		await saveLastTime(video);

		totalDone++;
		if (count < MAX_PAGES && (didCreate || didUpload)) {
			count++;
			await sleep(TIME_BETWEEN_PAGES * 1000);
		}
	}
}

main().then(() => {
	log('[S] Finished creating video pages.');
	process.exit();
});
