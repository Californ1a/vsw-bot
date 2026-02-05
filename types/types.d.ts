interface NamespaceInfo {
	id: number;
	case: string;
	name: string;
	subpages: boolean;
	canonical: string;
	content: boolean;
	nonincludable: boolean;
}

interface VideoTitleInfo {
	title: string;
	mediaTitle: string;
	restrictedTitleReasons: string[];
	originalTitle: string;
}
