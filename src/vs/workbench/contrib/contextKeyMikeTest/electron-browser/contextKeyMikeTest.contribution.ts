/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { ContextKeyMikeTest } from '../browser/contextKeyMikeTest.js';

registerWorkbenchContribution2(
	ContextKeyMikeTest.ID,
	ContextKeyMikeTest,
	WorkbenchPhase.AfterRestored
);
