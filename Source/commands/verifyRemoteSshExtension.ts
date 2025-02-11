/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type IActionContext } from "@microsoft/vscode-azext-utils";
import { extensions, type Extension } from "vscode";

import { remoteSshExtensionId } from "../constants";
import { localize } from "../localize";

export async function verifyRemoteSshExtension(
	context: IActionContext,
): Promise<void> {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const extension: Extension<any> | undefined =
		extensions.getExtension(remoteSshExtensionId);

	if (extension) {
		if (!extension.isActive) {
			await extension.activate();
		}
	} else {
		void context.ui.showWarningMessage(
			localize(
				"remoteSshInstall",
				'You must have the ["Remote - SSH" extension](command:azureVirtualMachines.showRemoteSshExtension) installed to perform this operation.',
			),
		);

		context.telemetry.properties.cancelStep = "installRemoteSsh";

		context.errorHandling.suppressDisplay = true;

		throw new Error(`${remoteSshExtensionId} extension is not installed.`);
	}
}
