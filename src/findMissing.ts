import { youtube_v3 } from '@googleapis/youtube';
import fs from 'node:fs/promises';

async function main() {
	let channelVidUrls: string[] = [];
	let apiVidUrls: youtube_v3.Schema$Video[] = [];
	try {
		const channelContent = await fs.readFile('channelVids.json', { encoding: 'utf8' });
		channelVidUrls = JSON.parse(channelContent);

		const apiContent = await fs.readFile('videos.json', { encoding: 'utf8' });
		apiVidUrls = JSON.parse(apiContent);
	} catch (error) {
		console.error(error);
		process.exit(1);
	}

	const channelVidIds = channelVidUrls.map(url => {
		const vidUrl = new URL(url);
		return vidUrl.searchParams.get('v');
	});

	console.log('Missing from API:');
	const missingApiVids = apiVidUrls.filter(vid => vid.id && !channelVidIds.includes(vid.id));
	console.log(JSON.stringify(missingApiVids, null, 2));

	console.log('');

	console.log('Missing from channel:');
	const missingChannelVids = channelVidIds.filter(id => !apiVidUrls.some(vid => vid.id === id));
	console.log(JSON.stringify(missingChannelVids, null, 2));
}

main();
