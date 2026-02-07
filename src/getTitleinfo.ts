import { bot, log } from './util/bot';
import { cleanTitle } from './util/titleinfo';
import parseArgs from 'minimist';
import readline from 'node:readline/promises';

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

async function main() {
	const args = parseArgs(process.argv, {
		string: ['title'],
		alias: { t: 'title' },
	});

	const siteInfo = await bot.query({
		meta: 'siteinfo',
		siprop: 'namespaces',
	});
	const namespaces = Object.values<NamespaceInfo>(siteInfo.query.namespaces).map(ns => ns.name);

	if (!args.title) {
		const prompt = 'Enter a title to clean: ';
		const exitLines = ['exit', 'quit', 'q'];
		while (true) {
			const title = await rl.question(prompt);
			if (title) {
				const lc = title.toLowerCase();
				if (exitLines.includes(lc)) {
					log('[I] Exiting.');
					break;
				}
				const titleInfo = cleanTitle(namespaces, title);
				log(titleInfo);
				process.stdout.write(prompt);
			} else {
				process.stdout.clearLine(0);
				process.stdout.cursorTo(0);
				process.stdout.write(prompt);
			}
		}
		return;
	}

	const titleInfo = cleanTitle(namespaces, args.title);
	log(titleInfo);
}

main().then(() => {
	process.exit();
});
