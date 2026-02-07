import 'dotenv/config';
import { Mwn } from 'mwn';
const log = Mwn.log;

log('[I] Initializing bot...');

const bot = await Mwn.init({
	apiUrl: process.env.WIKI_API_URL || '',
	username: process.env.WIKI_BOT_USERNAME || '',
	password: process.env.WIKI_BOT_PASSWORD || '',
	userAgent: 'AllianceBot/1.0.0 ([[User:Californ1a]])',
	defaultParams: {
		assert: 'bot',
	}
});

// Enable emergency shutoff based on unread messages on the bot's talk page
let busy = false;
const shutoffInterval = setInterval(async () => {
	if (busy) return;
	busy = true;

	try {
		const req = await bot.query({
			meta: 'notifications',
			notprop: 'count',
			notsections: 'alert|message',
		});
		if (req.query.notifications.rawcount > 0) {
			log('[W] New unread notification detected. Shutting down bot.');
			clearInterval(shutoffInterval);
			process.exit();
		}
	} catch (error) {
		log('[E] Error checking notifications: ' + error);
	} finally {
		busy = false;
	}
}, 5000); // Check every 5 seconds

log('[S] Bot initialized.');

export { bot, log };
