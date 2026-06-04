/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { WorkbenchPhase, registerWorkbenchContribution2, getWorkbenchContribution } from '../../../common/contributions.js';
import { registerAction2, Action2 } from '../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { XkcdOverlay } from '../browser/xkcd.js';

// NOTE: XkcdOverlay sequences the startup animation by calling into CutInOverlay
// (see xkcd.ts). It must be registered AFTER the cutIn contribution so that
// `getWorkbenchContribution(CutInOverlay.ID)` resolves an instantiated overlay.
registerWorkbenchContribution2(
	XkcdOverlay.ID,
	XkcdOverlay,
	WorkbenchPhase.AfterRestored
);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.showXkcd',
			title: nls.localize2('showXkcd', 'Show Random XKCD'),
			f1: true,
		});
	}

	async run(_accessor: ServicesAccessor): Promise<void> {
		await getWorkbenchContribution<XkcdOverlay>(XkcdOverlay.ID).showXkcd();
	}
});

Registry
	.as<IConfigurationRegistry>(Extensions.Configuration)
	.registerConfiguration({
		'id': 'workbench',
		'properties': {
			'workbench.experimental.xkcd.enabled': {
				'type': 'boolean',
				'default': true,
				'description': nls.localize('xkcd.enabled', "Controls whether a random XKCD comic is shown on startup.")
			}
		}
	});
