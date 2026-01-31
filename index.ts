import { parse } from 'iso8601-duration';
import bot from './src/bot';
import media from './templates/media';
import { fetchNewVideos } from './src/youtube';

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
	const vids = new Map<string, any>();
	for (const video of videos) {
		const title = video.snippet?.title || 'No title';
		if (vids.has(title)) {
			console.log(`Duplicate video title detected: ${title}. Skipping.`);
			continue;
		}
		
		const url = `https://www.youtube.com/watch?v=${video.id}`;
		const duration = video.contentDetails?.duration;
		let durationStr = '';
		if (duration) {
			const parsed = parse(duration);
			const hrs = (parsed.hours || 0).toString().padStart(2, '0');
			const mins = (parsed.minutes || 0).toString().padStart(2, '0');
			const secs = (parsed.seconds || 0).toString().padStart(2, '0');
			durationStr = `${hrs}:${mins}:${secs}`;
		}
		const date = video.snippet?.publishedAt ? new Date(video.snippet.publishedAt).toLocaleString() : '';
		const description = video.snippet?.description || 'No description';
		const mediaTemplate = media.replace(/NAME/g, title)
			.replace(/DATE/g, date)
			.replace(/TYPE/g, 'video')
			.replace(/DURATION/g, durationStr)
			.replace(/YOUTUBE_URL/g, url)
			.replace(/DESCRIPTION/g, description);
		
		vids.set(title, mediaTemplate);
		console.log(mediaTemplate);
	}
}

main();
