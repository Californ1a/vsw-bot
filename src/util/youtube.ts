import { youtube, youtube_v3 } from '@googleapis/youtube';
import { log } from './bot';
import fs from 'node:fs/promises';

const yt = youtube({
	version: 'v3',
	auth: process.env.YOUTUBE_API_KEY || '',
});

const VIDEOS_FILE = 'videos.json';

async function fetchVideoData(videoIds: string[]): Promise<youtube_v3.Schema$Video[]> {
	const chunk = 50;
	if (videoIds.length > chunk) {
		const chunks: string[][] = [];
		for (let i = 0; i < videoIds.length; i += chunk) {
			chunks.push(videoIds.slice(i, i + chunk));
		}
		const results = await Promise.all(chunks.map(chunk => fetchVideoData(chunk)));
		return results.flat();
	}
	const videoRes = await yt.videos.list({
		part: ['snippet', 'contentDetails'],
		id: videoIds,
	});

	log(`[I] Fetched video data from YouTube. Found ${videoRes.data.items?.length || 0} items.`);

	return videoRes.data.items || [];
}

async function fetchVideos(after?: Date, nextPageToken?: string) {
	let list: youtube_v3.Schema$SearchResult[] = [];
	if (after) {
		after.setTime(after.getTime() + 1000); // Increment by 1 sec to avoid duplicates
	}
	const searchRes = await yt.search.list({
		part: ['snippet'],
		channelId: process.env.YOUTUBE_CHANNEL_ID || '',
		order: 'date',
		maxResults: 25,
		safeSearch: 'none',
		type: ['video'],
		publishedAfter: after ? after.toISOString() : '',
		pageToken: nextPageToken || '',
	});

	log(`[I] Fetched new videos from YouTube. Found ${searchRes.data.items?.length || 0} items.`);

	list = searchRes.data.items || [];

	if (searchRes.data.nextPageToken) {
		const next = await fetchVideos(after, searchRes.data.nextPageToken);
		list = [...list, ...(next || [])];
	}

	return list;
}

async function fetchAllVideos(after?: Date) {
	log('[I] Fetching new videos from YouTube...');
	// Read videos from file to get recent video time
	
	const data: youtube_v3.Schema$Video[] = [];
	try {
		const content = await fs.readFile(VIDEOS_FILE, { encoding: 'utf8',  });

		const json: youtube_v3.Schema$Video[] = JSON.parse(content);
		data.push(...json);

		// Get the latest video's publishedAt date
		if (Array.isArray(data) && data.length > 0) {
			// Find newest video
			const latestVideo = data.reduce((latest, video) => {
				const dateA = video.snippet?.publishedAt ? new Date(video.snippet.publishedAt).getTime() : 0;
				const dateB = latest.snippet?.publishedAt ? new Date(latest.snippet.publishedAt).getTime() : 0;
				return dateA > dateB ? video : latest;
			});
			if (latestVideo?.snippet?.publishedAt) {
				after = new Date(latestVideo.snippet.publishedAt);
			}
		}
	} catch (error) {
		log('[W] Could not read recent video time from file; assuming first run.');
	}
	log(`[I] Recent video time: ${after ? after.toISOString() : 'Never'}${after ? ` (${after.toLocaleString()})` : ''}`);
	// Fetch new videos
	const searchResults = await fetchVideos(after);
	const videoIds = searchResults.map(item => item.id?.videoId).filter((id): id is string => !!id);
	if (videoIds.length === 0) {
		log('[W] No new videos found on YouTube.');
		return data;
	}
	log(`[S] Found ${searchResults.length} new videos on YouTube.`);
	log(`[I] Fetching data for ${videoIds.length} videos...`);
	const items = await fetchVideoData(videoIds);
	log(`[S] Fetched data for ${items.length} videos from YouTube.`);
	// Prepend new videos to existing list in file, without duplicates
	const combined: youtube_v3.Schema$Video[] = [...items, ...data].filter((video, index, self) => {
		return index === self.findIndex((v) => v.id === video.id);
	}).sort((a, b) => {
		// Sort by published date, newest first
		const dateA = a.snippet?.publishedAt ? new Date(a.snippet.publishedAt).getTime() : 0;
		const dateB = b.snippet?.publishedAt ? new Date(b.snippet.publishedAt).getTime() : 0;
		return dateB - dateA;
	});

	// Write combined list back to file
	try {
		const controller = new AbortController();
		const { signal } = controller;
		const jsonStr = JSON.stringify(combined, null, 2);
		const data = new Uint8Array(Buffer.from(jsonStr));
		await fs.writeFile(VIDEOS_FILE, data, { signal });
	} catch (error) {
		log('[E] Could not write videos to file:');
		log(error);
		return [];
	}

	log(`[S] Fetched ${combined.length} total videos from YouTube.`);

	return combined;
}

export { fetchAllVideos };
