import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
let isUserRename = false; // Flag to track user-initiated renames

interface XcodeConfig {
    projectPath: string;
    xcodeProjectPath: string;
    authorName: string;
}

let outputChannel: vscode.OutputChannel;

async function findXcodeProject(startPath: string): Promise<string | null> {
    try {
        const files = await fs.promises.readdir(startPath);
        const xcodeProj = files.find((file) => file.endsWith('.xcodeproj'));
        if (xcodeProj) {
            return path.join(startPath, xcodeProj);
        }

        // Try parent directory if not at root
        const parentDir = path.dirname(startPath);
        if (parentDir !== startPath) {
            return findXcodeProject(parentDir);
        }

        return null;
    } catch (error) {
        console.error('Error finding Xcode project:', error);
        return null;
    }
}

async function getConfiguration(
    context: vscode.ExtensionContext
): Promise<XcodeConfig> {
    const config = vscode.workspace.getConfiguration('xcodeIntegration');
    let projectPath = config.get<string>('projectPath');
    let xcodeProjectPath = config.get<string>('xcodeProjectPath');
    let authorName = config.get<string>('authorName');

    // Auto-detect if not configured
    if (!projectPath || !xcodeProjectPath) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const wsPath = workspaceFolders[0].uri.fsPath;

            // Auto-detect project path
            if (!projectPath) {
                projectPath = wsPath;
                await config.update(
                    'projectPath',
                    projectPath,
                    vscode.ConfigurationTarget.Workspace
                );
            }

            // Auto-detect Xcode project
            if (!xcodeProjectPath) {
                const foundXcodeProj = await findXcodeProject(wsPath);
                if (foundXcodeProj) {
                    xcodeProjectPath = foundXcodeProj;
                    await config.update(
                        'xcodeProjectPath',
                        xcodeProjectPath,
                        vscode.ConfigurationTarget.Workspace
                    );
                }
            }
        }
    }

    // Auto-detect author name if not set
    if (!authorName) {
        try {
            const { stdout } = await execAsync('git config user.name');
            authorName = stdout.trim();
            if (authorName) {
                await config.update(
                    'authorName',
                    authorName,
                    vscode.ConfigurationTarget.Global
                );
            }
        } catch (error) {
            console.error('Error getting Git user name:', error);
        }
    }

    // Validate configuration
    if (!projectPath || !xcodeProjectPath) {
        const result = await vscode.window.showErrorMessage(
            'Xcode project settings are not configured. Would you like to configure them now?',
            'Configure',
            'Cancel'
        );

        if (result === 'Configure') {
            await vscode.commands.executeCommand(
                'workbench.action.openSettings',
                'xcodeIntegration'
            );
        }
    }

    return {
        projectPath: projectPath || '',
        xcodeProjectPath: xcodeProjectPath || '',
        authorName: authorName || '',
    };
}

async function executeScript(command: string): Promise<void> {
    const { stdout, stderr } = await execAsync(command);
    if (stdout) {
        outputChannel.appendLine(stdout);
    }
    if (stderr) {
        outputChannel.appendLine(stderr);
    }
}

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('Xcode Integration');
    context.subscriptions.push(outputChannel);

    // Register command for new Swift file
    let newSwiftFile = vscode.commands.registerCommand(
        'xcode-integration.newSwiftFile',
        async (uri: vscode.Uri) => {
            try {
                const config = await getConfiguration(context);
                if (!config.projectPath || !config.xcodeProjectPath) {
                    throw new Error('Project paths not configured');
                }

                // Get target directory
                const targetDir =
                    uri?.fsPath ||
                    (vscode.window.activeTextEditor?.document.uri.fsPath
                        ? path.dirname(
                              vscode.window.activeTextEditor.document.uri.fsPath
                          )
                        : vscode.workspace.workspaceFolders?.[0].uri.fsPath);

                if (!targetDir) {
                    throw new Error('No target directory selected');
                }

                // Ask for file name
                const fileName = await vscode.window.showInputBox({
                    prompt: 'Enter the name of the new Swift file',
                    placeHolder: 'MyNewFile',
                    validateInput: (value: string) => {
                        if (!value) {
                            return 'File name is required';
                        }
                        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(value)) {
                            return 'Invalid file name. Use alphanumeric characters and underscores, start with a letter';
                        }
                        return null;
                    },
                });

                if (!fileName) {
                    return;
                }

                const fullPath = path.join(targetDir, `${fileName}.swift`);

                // Create empty file
                fs.writeFileSync(fullPath, '');

                // Show template picker and add to Xcode
                const templates = [
                    'SwiftUI View',
                    'Swift File',
                    'Protocol',
                    'Class',
                    'ViewModel',
                ];
                const selectedTemplate = await vscode.window.showQuickPick(
                    templates,
                    {
                        placeHolder: 'Select a template',
                    }
                );

                if (!selectedTemplate) {
                    fs.unlinkSync(fullPath); // Clean up if cancelled
                    return;
                }

                // Add to Xcode
                await executeScript(
                    `XCODE_AUTHOR_NAME="${config.authorName}" XCODE_PROJECT_PATH="${config.xcodeProjectPath}" PROJECT_PATH="${config.projectPath}" ruby "${context.extensionPath}/scripts/add_to_xcode.rb" "${fullPath}" "${selectedTemplate}"`
                );
                // Open the new file
                const doc = await vscode.workspace.openTextDocument(fullPath);
                await vscode.window.showTextDocument(doc);

                vscode.window.showInformationMessage(
                    `Created ${fileName}.swift with ${selectedTemplate} template`
                );
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Error: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }
    );

    // Register command for new folder
    let newFolder = vscode.commands.registerCommand(
        'xcode-integration.newFolder',
        async (uri: vscode.Uri) => {
            try {
                const config = await getConfiguration(context);
                if (!config.projectPath || !config.xcodeProjectPath) {
                    throw new Error('Project paths not configured');
                }

                // Get target directory
                const targetDir =
                    uri?.fsPath ||
                    (vscode.window.activeTextEditor?.document.uri.fsPath
                        ? path.dirname(
                              vscode.window.activeTextEditor.document.uri.fsPath
                          )
                        : vscode.workspace.workspaceFolders?.[0].uri.fsPath);

                if (!targetDir) {
                    throw new Error('No target directory selected');
                }

                // Ask for folder name
                const folderName = await vscode.window.showInputBox({
                    prompt: 'Enter the name of the new folder',
                    placeHolder: 'MyNewFolder',
                    validateInput: (value: string) => {
                        if (!value) {
                            return 'Folder name is required';
                        }
                        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(value)) {
                            return 'Invalid folder name. Use alphanumeric characters and underscores, start with a letter';
                        }
                        return null;
                    },
                });

                if (!folderName) {
                    return;
                }

                const fullPath = path.join(targetDir, folderName);

                // Create folder
                fs.mkdirSync(fullPath, { recursive: true });

                // Add to Xcode
                await executeScript(
                    `XCODE_AUTHOR_NAME="${config.authorName}" XCODE_PROJECT_PATH="${config.xcodeProjectPath}" PROJECT_PATH="${config.projectPath}" ruby "${context.extensionPath}/scripts/add_group_to_xcode.rb" "${fullPath}"`
                );

                vscode.window.showInformationMessage(
                    `Created folder ${folderName} and added to Xcode`
                );
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Error: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }
    );

    // Register command for deleting Swift file
    let deleteFile = vscode.commands.registerCommand(
        'xcode-integration.deleteFile',
        async (uri: vscode.Uri) => {
            try {
                const config = await getConfiguration(context);
                if (!config.projectPath || !config.xcodeProjectPath) {
                    throw new Error('Project paths not configured');
                }

                const filePath = uri.fsPath;

                // Confirm deletion
                const fileName = path.basename(filePath);
                const confirmed = await vscode.window.showWarningMessage(
                    `Are you sure you want to delete '${fileName}'? This will remove it from both the filesystem and Xcode project.`,
                    { modal: true },
                    'Delete',
                    'Cancel'
                );

                if (confirmed !== 'Delete') {
                    return;
                }

                // Show progress
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: `Deleting ${fileName}`,
                        cancellable: false,
                    },
                    async (progress) => {
                        // Execute delete script
                        await executeScript(
                            `XCODE_PROJECT_PATH="${config.xcodeProjectPath}" PROJECT_PATH="${config.projectPath}" ruby "${context.extensionPath}/scripts/delete_from_xcode.rb" "${filePath}"`
                        );

                        // Refresh explorer
                        await vscode.commands.executeCommand(
                            'workbench.files.action.refreshFilesExplorer'
                        );
                    }
                );

                vscode.window.showInformationMessage(
                    `Successfully deleted ${fileName}`
                );
            } catch (error) {
                console.error('Error in deleteFile:', error);
                vscode.window.showErrorMessage(
                    `Error: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }
    );

    // Register command for deleting folder
    let deleteFolder = vscode.commands.registerCommand(
        'xcode-integration.deleteFolder',
        async (uri: vscode.Uri) => {
            try {
                const config = await getConfiguration(context);
                if (!config.projectPath || !config.xcodeProjectPath) {
                    throw new Error('Project paths not configured');
                }

                const folderPath = uri.fsPath;

                // Confirm deletion
                const folderName = path.basename(folderPath);
                const confirmed = await vscode.window.showWarningMessage(
                    `Are you sure you want to delete folder '${folderName}' and all its contents? This will remove it from both the filesystem and Xcode project.`,
                    { modal: true },
                    'Delete',
                    'Cancel'
                );

                if (confirmed !== 'Delete') {
                    return;
                }

                // Count files to be deleted
                const files = await vscode.workspace.findFiles(
                    new vscode.RelativePattern(folderPath, '**/*.swift')
                );

                // Show warning if many files will be deleted
                if (files.length > 5) {
                    const confirmMany = await vscode.window.showWarningMessage(
                        `This will delete ${files.length} Swift files. Are you sure?`,
                        { modal: true },
                        'Delete',
                        'Cancel'
                    );

                    if (confirmMany !== 'Delete') {
                        return;
                    }
                }

                // Show progress
                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: `Deleting ${folderName}`,
                        cancellable: false,
                    },
                    async (progress) => {
                        // Execute delete script
                        await executeScript(
                            `XCODE_PROJECT_PATH="${config.xcodeProjectPath}" PROJECT_PATH="${config.projectPath}" ruby "${context.extensionPath}/scripts/delete_group_from_xcode.rb" "${folderPath}"`
                        );

                        // Refresh explorer
                        await vscode.commands.executeCommand(
                            'workbench.files.action.refreshFilesExplorer'
                        );
                    }
                );

                vscode.window.showInformationMessage(
                    `Successfully deleted folder ${folderName}`
                );
            } catch (error) {
                console.error('Error in deleteFolder:', error);
                vscode.window.showErrorMessage(
                    `Error: ${error instanceof Error ? error.message : String(error)}`
                );
            }
        }
    );

    context.subscriptions.push(newSwiftFile);
    context.subscriptions.push(newFolder);
    context.subscriptions.push(deleteFile);
    context.subscriptions.push(deleteFolder);
}

export function deactivate() {}
