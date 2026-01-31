import { parse } from 'iso8601-duration';
import bot from './src/bot.ts';
import { fetchNewVideos } from './src/youtube.ts';

async function main() {
	console.log('Starting video fetch...');
	const videos = await fetchNewVideos();
	console.log('Video fetch complete.');
	if (videos.length === 0) {
		console.log('No new videos found.');
		return;
	}
	console.log(JSON.stringify(videos, null, 2));
	console.log(`Found ${videos.length} new videos.`);
	for (const video of videos) {
		const title = video.snippet?.title || 'No title';
		const url = `https://www.youtube.com/watch?v=${video.id}`;
		const duration = video.contentDetails?.duration;
		//console.log(`- ${title}: ${url} (${duration})`);
	}
}

main();
