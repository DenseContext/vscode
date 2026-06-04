/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INativeHostService } from '../../../../platform/native/common/native.js';

export interface IComic {
	key: number;
	title: string;
	image: string;
	alt?: string;
}

export interface IComicProvider {
	readonly id: string;
	readonly name: string;
	readonly supportUrl: string;
	readonly seenStorageKey: string;
	readonly latestStorageKey: string;
	resolveLatest(): Promise<number>;
	fetchComic(num: number): Promise<IComic | null>;
}

async function fetchText(nativeHost: INativeHostService, url: string): Promise<string | null> {
	try {
		const result = await nativeHost.fetchUrl(url);
		if (result.statusCode >= 200 && result.statusCode < 300) {
			return result.body;
		}
		return null;
	} catch {
		return null;
	}
}

async function fetchJson<T>(nativeHost: INativeHostService, url: string): Promise<T | null> {
	const text = await fetchText(nativeHost, url);
	if (!text) {
		return null;
	}
	try {
		return JSON.parse(text) as T;
	} catch {
		return null;
	}
}

function findAllMatches(html: string, pattern: RegExp): RegExpExecArray[] {
	const results: RegExpExecArray[] = [];
	let m: RegExpExecArray | null;
	while ((m = pattern.exec(html)) !== null) {
		results.push(m);
	}
	return results;
}

function decodeHtmlEntities(text: string): string {
	return text
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&#x27;/g, "'")
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

interface IXkcdJson {
	num: number;
	safe_title: string;
	img: string;
	alt: string;
}

export class XkcdProvider implements IComicProvider {
	readonly id = 'xkcd';
	readonly name = 'xkcd';
	readonly supportUrl = 'https://xkcd.com/books/';
	readonly seenStorageKey = 'xkcd.seenComics';
	readonly latestStorageKey = 'xkcd.latestNum';

	constructor(private readonly _nativeHost: INativeHostService) { }

	async resolveLatest(): Promise<number> {
		const data = await fetchJson<IXkcdJson>(this._nativeHost, 'https://xkcd.com/info.0.json');
		return data?.num ?? 0;
	}

	async fetchComic(num: number): Promise<IComic | null> {
		const data = await fetchJson<IXkcdJson>(this._nativeHost, `https://xkcd.com/${num}/info.0.json`);
		if (!data) {
			return null;
		}
		return {
			key: data.num,
			title: data.safe_title,
			image: data.img,
			alt: data.alt,
		};
	}
}

export class DinosaurComicsProvider implements IComicProvider {
	readonly id = 'dinosaur';
	readonly name = 'Dinosaur Comics';
	readonly supportUrl = 'https://www.qwantz.com/';
	readonly seenStorageKey = 'comics.dinosaur.seenComics';
	readonly latestStorageKey = 'comics.dinosaur.latestNum';

	constructor(private readonly _nativeHost: INativeHostService) { }

	async resolveLatest(): Promise<number> {
		const html = await fetchText(this._nativeHost, 'https://www.qwantz.com/');
		if (!html) {
			return 0;
		}
		let max = 0;
		for (const m of findAllMatches(html, /comic=(\d+)/g)) {
			max = Math.max(max, parseInt(m[1], 10));
		}
		return max;
	}

	async fetchComic(num: number): Promise<IComic | null> {
		const html = await fetchText(this._nativeHost, `https://www.qwantz.com/index.php?comic=${num}`);
		if (!html) {
			return null;
		}
		const imgMatch = html.match(/<img\s[^>]*src="(comics\/[^"]+)"[^>]*>/i);
		if (!imgMatch) {
			return null;
		}
		const titleMatch = imgMatch[0].match(/title="([^"]*)"/i);
		return {
			key: num,
			title: `Dinosaur Comics #${num}`,
			image: `https://www.qwantz.com/${imgMatch[1]}`,
			alt: titleMatch ? decodeHtmlEntities(titleMatch[1]) : undefined,
		};
	}
}

export class PhdComicsProvider implements IComicProvider {
	readonly id = 'phd';
	readonly name = 'PHD Comics';
	readonly supportUrl = 'https://phdcomics.com/';
	readonly seenStorageKey = 'comics.phd.seenComics';
	readonly latestStorageKey = 'comics.phd.latestNum';

	constructor(private readonly _nativeHost: INativeHostService) { }

	async resolveLatest(): Promise<number> {
		const html = await fetchText(this._nativeHost, 'https://phdcomics.com/comics.php');
		if (!html) {
			return 0;
		}
		let max = 0;
		for (const m of findAllMatches(html, /comicid=(\d+)/g)) {
			max = Math.max(max, parseInt(m[1], 10));
		}
		if (max === 0) {
			for (const m of findAllMatches(html, /[?&]f=(\d+)/g)) {
				max = Math.max(max, parseInt(m[1], 10));
			}
		}
		return max;
	}

	async fetchComic(num: number): Promise<IComic | null> {
		const html = await fetchText(this._nativeHost, `https://phdcomics.com/comics.php?f=${num}`);
		if (!html) {
			return null;
		}
		const imgMatch = html.match(/<img\s[^>]*src=["']?((?:https?:)?\/\/[^"'\s>]*\/comics\/archive\/phd[^"'\s>]*)["'\s>]/i);
		if (!imgMatch) {
			return null;
		}
		let title = `PHD Comics #${num}`;
		const titleMatch = html.match(/<title>[\s\S]*?PHD Comics:\s*([\s\S]*?)<\/title>/i);
		if (titleMatch) {
			const stripped = decodeHtmlEntities(titleMatch[1]).trim();
			if (stripped) {
				title = stripped;
			}
		}
		let imageSrc = imgMatch[1];
		if (imageSrc.startsWith('http://')) {
			imageSrc = imageSrc.replace('http://', 'https://');
		}
		return {
			key: num,
			title,
			image: imageSrc,
		};
	}
}

export function createAllProviders(nativeHostService: INativeHostService): IComicProvider[] {
	return [
		new XkcdProvider(nativeHostService),
		new DinosaurComicsProvider(nativeHostService),
		new PhdComicsProvider(nativeHostService),
	];
}
