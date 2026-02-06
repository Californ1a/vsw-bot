const FALSE_SUBPAGE_REASON = 'false subpage';

function unescapeHTML(str: string) {
  return str.replace(
    /&amp;|&lt;|&gt;|&#39;|&quot;/g,
    tag => ({
      '&amp;': '&',
       '&lt;': '<',
       '&gt;': '>',
       '&#39;': "'",
       '&quot;': '"'
    }[tag] || tag)
  );
}

function cleanTitle(namespaces: string[], postTitle?: string | null) {
	if (!postTitle) {
		return { title: '', mediaTitle: '', restrictedTitleReasons: [], originalTitle: '' };
	}

	const restrictedTitleReasons: string[] = [];
	let originalTitle = postTitle;
	let mediaTitle = '';

	let title = unescapeHTML(postTitle).replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
	if (title.includes("|")) {
		originalTitle = title.replace(/\|/g, "{{!}}");
		title = title.replace(/\|/g, "-");
		restrictedTitleReasons.push("Cannot use pipe characters in titles");
	}
	if (title.includes("#")) {
		originalTitle = title;
		title = title.replace(/#/g, "");
		restrictedTitleReasons.push("Cannot use # in titles");
	}
	if (title.includes("[") || title.includes("]")) {
		originalTitle = title;
		title = title.replace(/\[/g, "(").replace(/\]/g, ")");
		restrictedTitleReasons.push("Cannot use square brackets in titles");
	}
	if (title.includes("/")) {
		restrictedTitleReasons.push(FALSE_SUBPAGE_REASON);
	}
	if (title.charAt(0) !== title.charAt(0).toUpperCase()) {
		originalTitle = (originalTitle ? originalTitle : title);
	}
	const colonPrefix = title.match(/^([^:]+): *(.*)/);
	if (colonPrefix && colonPrefix.length) {
		mediaTitle = title.replaceAll(':', '-');

		if (colonPrefix[1] && Object.values(namespaces).includes(colonPrefix[1])) {
			originalTitle = title;
			title = colonPrefix[1] + " - " + colonPrefix[2];
			restrictedTitleReasons.push("actual name begins with '" + colonPrefix[1]
				+ ":', putting it in the wrong namespace; displaytitle used");
		}
	} else {
		mediaTitle = title;
	}
	mediaTitle = mediaTitle.charAt(0).toUpperCase() + mediaTitle.replace(/\//g, '-').slice(1);

	return { title, mediaTitle, restrictedTitleReasons, originalTitle };
}

export { cleanTitle, FALSE_SUBPAGE_REASON };
