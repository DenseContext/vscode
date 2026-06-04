/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const ISecondBarService = createDecorator<ISecondBarService>('secondBarService');

/**
 * The second bar is a horizontal bar that sits directly above the status bar
 * at the bottom of the workbench window.
 */
export interface ISecondBarService {

	readonly _serviceBrand: undefined;

	/**
	 * Update the text shown in the second bar.
	 */
	setText(text: string): void;
}
