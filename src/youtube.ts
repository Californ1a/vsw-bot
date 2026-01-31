import { youtube, youtube_v3 } from '@googleapis/youtube';

const yt = youtube({
	version: 'v3',
	auth: process.env.YOUTUBE_API_KEY,
});

async function delay(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchVideos(after?: Date, nextPageToken?: string) {
	const searchRes = await yt.search.list({
		part: ['snippet'],
		channelId: process.env.YOUTUBE_CHANNEL_ID,
		order: 'date',
		maxResults: 50,
		publishedAfter: after ? after.toISOString() : undefined,
		pageToken: nextPageToken,
	});

	const videoRes = await yt.videos.list({
		part: ['contentDetails'],
		id: searchRes.data.items?.map((item) => item.id?.videoId || '').filter((id) => id) || [],
	});

	// Insert file details into corresponding search items
	for (const item of searchRes.data.items || []) {
		const video = videoRes.data.items?.find((v) => v.id === item.id?.videoId);
		if (video) {
			(item as youtube_v3.Schema$Video).contentDetails = video.contentDetails;
		}
	}

	return searchRes.data as youtube_v3.Schema$VideoListResponse;
}

async function fetchNewVideos(after?: Date) {
	console.log('Fetching new videos from YouTube...');
	// Read videos from file to get last checked time
	const data: youtube_v3.Schema$Video[] = [];
	let file: Bun.BunFile | null = null;
	if (!after) {
		try {
			file = Bun.file('videos.json', { type: 'application/json' });
			const exists = await file.exists();
			if (!exists) throw new Error('File does not exist');

			const json: youtube_v3.Schema$Video[] = await file.json();
			data.push(...json);

			// Get the latest video's publishedAt date
			if (Array.isArray(data) && data.length > 0) {
				// Newest video is always first
				const latestVideo = data[0];
				if (latestVideo?.snippet?.publishedAt) {
					after = new Date(latestVideo.snippet.publishedAt);
				}
			}
		} catch (error) {
			// File doesn't exist or can't be read; assume first run
			console.log('Could not read last checked time from file; assuming first run.');
		}
	}
	console.log('Last checked time:', after ? after.toISOString() : 'Never');
	// Fetch new videos
	const list: youtube_v3.Schema$Video[] = [];
	let nextPageToken: string | undefined = undefined;
	do {
		const res = await fetchVideos(after, nextPageToken);
		const items = res.items || [];
		list.push(...items);
		if (process.env.NODE_ENV === 'development') {
			nextPageToken = undefined; // Stop after first page in development
		} else {
			nextPageToken = res.nextPageToken || undefined;
		}
		if (nextPageToken) {
			await delay(1000); // To respect rate limits
		}
	} while (nextPageToken);

	// Prepend new videos to existing list in file
	try {
		const combined = [...list, ...data];
		if (!file) {
			file = Bun.file('videos.json', { type: 'application/json' });
		}
		await file.write(JSON.stringify(combined, null, 2));
	} catch (error) {
		console.error('Could not write videos to file:', error);
	}

	return list;
}

export { fetchNewVideos };
