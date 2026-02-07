import { bot, log } from './util/bot';
import { cleanTitle } from './util/titleinfo';
import { fetchAllVideos } from './util/youtube';

async function main() {
	const siteInfo = await bot.query({
		meta: 'siteinfo',
		siprop: 'namespaces',
	});
	const namespaces = Object.values<NamespaceInfo>(siteInfo.query.namespaces).map(ns => ns.name);

	const videos = (await fetchAllVideos()).sort((a, b) => {
			// Sort by published date, oldest first
			const dateA = a.snippet?.publishedAt ? new Date(a.snippet.publishedAt).getTime() : 0;
			const dateB = b.snippet?.publishedAt ? new Date(b.snippet.publishedAt).getTime() : 0;
			return dateA - dateB;
		});

	log(`[S] Total videos: ${videos.length}`);

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
		log('[W] Duplicate titles found:');
		duplicateTitles.forEach((videoIds, title) => {
			if (videoIds.length > 1) {
				log(`[W]   ${title}`);
				videoIds.forEach(vid => {
					log(`[W]    - https://www.youtube.com/watch?v=${vid}`);
				});
			}
		});
	} else {
		log('[I] No duplicate titles found.');
	}
}

main().then(() => {
	process.exit();
});
