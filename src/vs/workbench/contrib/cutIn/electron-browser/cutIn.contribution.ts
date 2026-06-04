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
import { CutInOverlay } from '../browser/cutIn.js';

registerWorkbenchContribution2(
	CutInOverlay.ID,
	CutInOverlay,
	WorkbenchPhase.AfterRestored
);

registerAction2(class extends Action2 {
	constructor() {
		super({
			id: 'workbench.action.showCutIn',
			title: nls.localize2('showCutIn', 'Show Cut-In Animation'),
			f1: true,
		});
	}

	run(_accessor: ServicesAccessor): void {
		getWorkbenchContribution<CutInOverlay>(CutInOverlay.ID).showCutIn();
	}
});

Registry
	.as<IConfigurationRegistry>(Extensions.Configuration)
	.registerConfiguration({
		'id': 'workbench',
		'properties': {
			'workbench.experimental.cutIn.enabled': {
				'type': 'boolean',
				'default': true,
				'description': nls.localize('cutIn.enabled', "Controls whether the cut-in animation plays on startup.")
			},
			'workbench.experimental.cutIn.sound': {
				'type': 'boolean',
				'default': true,
				'description': nls.localize('cutIn.sound', "Controls whether the cut-in animation plays a sound effect.")
			},
			'workbench.experimental.cutIn.style': {
				'type': 'string',
				'enum': ['mvc', 'persona', 'phoenix-wright', 'guilty-gear'],
				'enumDescriptions': [
					nls.localize('cutIn.style.mvc', "Marvel vs Capcom — parallelogram portrait slides in from left with white flash"),
					nls.localize('cutIn.style.persona', "Persona 5 — red skewed stripe snaps across the screen"),
					nls.localize('cutIn.style.phoenix', "Phoenix Wright — green panel slams in with screen shake and bold OBJECTION! text"),
					nls.localize('cutIn.style.gg', "Guilty Gear — black screen wipe with diagonal cross-hatching and red glow text"),
				],
				'default': 'mvc',
				'description': nls.localize('cutIn.style', "The visual style of the cut-in animation.")
			}
		}
	});
