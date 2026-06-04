/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/secondbarpart.css';
import { localize } from '../../../../nls.js';
import { $, append } from '../../../../base/browser/dom.js';
import { assertReturnsDefined } from '../../../../base/common/types.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { contrastBorder } from '../../../../platform/theme/common/colorRegistry.js';
import { Part } from '../../part.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { ISecondBarService } from '../../../services/secondBar/browser/secondBarService.js';
import { STATUS_BAR_BACKGROUND, STATUS_BAR_FOREGROUND, STATUS_BAR_BORDER } from '../../../common/theme.js';

export class SecondBarPart extends Part implements ISecondBarService {

	declare readonly _serviceBrand: undefined;

	static readonly HEIGHT = 24;

	//#region IView

	readonly minimumWidth: number = 0;
	readonly maximumWidth: number = Number.POSITIVE_INFINITY;
	readonly minimumHeight: number = SecondBarPart.HEIGHT;
	readonly maximumHeight: number = SecondBarPart.HEIGHT;

	//#endregion

	private textContainer: HTMLElement | undefined;

	constructor(
		@IThemeService themeService: IThemeService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IStorageService storageService: IStorageService,
	) {
		super(Parts.SECONDBAR_PART, { hasTitle: false }, themeService, storageService, layoutService);
	}

	protected override createContentArea(parent: HTMLElement): HTMLElement {
		this.element = parent;

		this.textContainer = append(this.element, $('span.secondbar-text'));
		this.textContainer.textContent = localize('secondBar.default', "Second Bar");

		return this.element;
	}

	setText(text: string): void {
		if (this.textContainer) {
			this.textContainer.textContent = text;
		}
	}

	override updateStyles(): void {
		super.updateStyles();

		const container = assertReturnsDefined(this.getContainer());

		container.style.backgroundColor = this.getColor(STATUS_BAR_BACKGROUND) || '';
		container.style.color = this.getColor(STATUS_BAR_FOREGROUND) || '';

		const borderColor = this.getColor(STATUS_BAR_BORDER) || this.getColor(contrastBorder);
		container.style.borderTop = borderColor ? `1px solid ${borderColor}` : '';
	}

	override layout(width: number, height: number, top: number, left: number): void {
		super.layout(width, height, top, left);
		super.layoutContents(width, height);
	}

	toJSON(): object {
		return {
			type: Parts.SECONDBAR_PART
		};
	}
}

registerSingleton(ISecondBarService, SecondBarPart, InstantiationType.Eager);
