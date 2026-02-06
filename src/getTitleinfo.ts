import { bot, log } from './util/bot';
import { cleanTitle } from './util/titleinfo';
import parseArgs from 'minimist';

async function main() {
	const args = parseArgs(Bun.argv, {
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
		process.stdout.write(prompt);
		const exitLines = ['exit', 'quit', 'q'];
		for await (const line of console) {
			const title = line.trim();
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
