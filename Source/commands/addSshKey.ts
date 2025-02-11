/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	type ComputeManagementClient,
	type VirtualMachine,
	type VirtualMachineExtension,
} from "@azure/arm-compute";
import {
	nonNullValueAndProp,
	parseError,
	type IActionContext,
} from "@microsoft/vscode-azext-utils";
import * as fse from "fs-extra";
import { ProgressLocation, Uri, window } from "vscode";

import { sshFsPath, vmFilter } from "../constants";
import { ext } from "../extensionVariables";
import { localize } from "../localize";
import {
	VirtualMachineTreeItem,
	type ResolvedVirtualMachineTreeItem,
} from "../tree/VirtualMachineTreeItem";
import { createComputeClient } from "../utils/azureClients";
import { configureSshConfig } from "../utils/sshUtils";

export async function addSshKey(
	context: IActionContext,
	node?: ResolvedVirtualMachineTreeItem,
): Promise<void> {
	if (!node) {
		node = await ext.rgApi.pickAppResource<ResolvedVirtualMachineTreeItem>(
			context,
			{
				filter: vmFilter,
				// TODO: only show Linux VMs
				// expectedChildContextValue: new RegExp(VirtualMachineTreeItem.linuxContextValue)
			},
		);

		if (
			!node.contextValue.includes(
				VirtualMachineTreeItem.linuxContextValue,
			)
		) {
			throw new Error(
				localize("addSshKeyNotLinux", "Only Linux VMs are supported."),
			);
		}
	}

	if (!node) {
		return;
	}

	const computeClient: ComputeManagementClient = await createComputeClient([
		context,
		node.subscription,
	]);

	const vm: VirtualMachine = node.data;

	const sshPublicKey: Uri = (
		await context.ui.showOpenDialog({
			defaultUri: Uri.file(sshFsPath),
			filters: { "SSH Public Key": ["pub"] },
		})
	)[0];

	const extensionName: string = "enablevmaccess";

	let vmExtension: VirtualMachineExtension;

	try {
		// the VMAccessForLinux extension is necessary to configure more SSH keys
		vmExtension = await computeClient.virtualMachineExtensions.get(
			node.resourceGroup,
			node.name,
			extensionName,
		);
	} catch (e) {
		if (parseError(e).errorType !== "ResourceNotFound") {
			throw e;
		}

		vmExtension = {
			location: vm.location,
			publisher: "Microsoft.OSTCExtensions",
			typePropertiesType: "VMAccessForLinux",
			type: "Microsoft.Compute/virtualMachines/extensions",
			typeHandlerVersion: "1.4",
			autoUpgradeMinorVersion: true,
		};
	}

	vmExtension.protectedSettings = {
		ssh_key: (await fse.readFile(sshPublicKey.fsPath)).toString(),
		username: (vm.osProfile && vm.osProfile.adminUsername) || "azureuser",
	};

	const addingSshKey: string = localize(
		"addingSshKey",
		'Adding SSH Public Key "{0}" to Azure VM "{1}" ...',
		sshPublicKey.fsPath,
		node.name,
	);

	const addingSshKeySucceeded: string = localize(
		"addingSshKeySucceeded",
		'Successfully added key to "{0}".',
		node.name,
	);

	await window.withProgress(
		{ location: ProgressLocation.Notification, title: addingSshKey },
		async (): Promise<void> => {
			ext.outputChannel.appendLog(addingSshKey);

			await computeClient.virtualMachineExtensions.beginCreateOrUpdateAndWait(
				nonNullValueAndProp(node, "resourceGroup"),
				nonNullValueAndProp(node, "name"),
				extensionName,
				vmExtension,
			);

			void window.showInformationMessage(addingSshKeySucceeded);

			ext.outputChannel.appendLog(addingSshKeySucceeded);
		},
	);

	// the ssh/config file lists the private key, not the .pub file, so remove the ext from the file path
	await configureSshConfig(
		context,
		node,
		sshPublicKey.path.substring(0, sshPublicKey.path.length - 4),
	);
}
