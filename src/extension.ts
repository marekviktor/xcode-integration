import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface XcodeConfig {
    projectPath: string;
    xcodeProjectPath: string;
    authorName: string;
}

let outputChannel: vscode.OutputChannel;
let movePromiseResolve: (() => void) | null = null;

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

// Or if you want to handle both files and folders consistently:
function removeLastPathComponent(inputPath: string): string {
    // Remove trailing slash if exists
    const normalizedPath = inputPath.replace(/\/$/, '');
    return path.dirname(normalizedPath);
}

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('Xcode Integration');
    context.subscriptions.push(outputChannel);

    interface BufferEntry {
        path: string;
        timestamp: number;
    }
    // Update the buffer declarations
    let createBuffer: { [key: string]: BufferEntry } = {};
    let deleteBuffer: { [key: string]: BufferEntry } = {};
    let processingTimeout: NodeJS.Timeout | null = null;

    // Add buffer cleanup function
    const cleanupBuffers = () => {
        const now = Date.now();
        const BUFFER_TIMEOUT = 1000; // 1 second timeout

        // Cleanup old entries
        Object.keys(createBuffer).forEach((key) => {
            if (now - createBuffer[key].timestamp > BUFFER_TIMEOUT) {
                delete createBuffer[key];
            }
        });

        Object.keys(deleteBuffer).forEach((key) => {
            if (now - deleteBuffer[key].timestamp > BUFFER_TIMEOUT) {
                delete deleteBuffer[key];
            }
        });
    };

    // Update the processMove function
    const processMove = async () => {
        cleanupBuffers(); // Clean up old entries first

        for (const newPath of Object.keys(createBuffer)) {
            const fileName = path.basename(newPath);
            const possibleOldPaths = Object.keys(deleteBuffer).filter(
                (oldPath) => path.basename(oldPath) === fileName
            );

            if (possibleOldPaths.length === 1) {
                const oldPath = possibleOldPaths[0];
                const timeDiff = Math.abs(
                    createBuffer[newPath].timestamp -
                        deleteBuffer[oldPath].timestamp
                );

                // Only process if events happened within 500ms of each other
                if (timeDiff > 500) {
                    continue;
                }

                const oldPathWithoutLastComponent =
                    removeLastPathComponent(oldPath);
                const newPathWithoutLastComponent =
                    removeLastPathComponent(newPath);

                if (
                    oldPathWithoutLastComponent === newPathWithoutLastComponent
                ) {
                    // Clear the buffers for this entry since it's not a move
                    delete createBuffer[newPath];
                    delete deleteBuffer[oldPath];
                    continue;
                }

                try {
                    const config = await getConfiguration(context);
                    if (!config.projectPath || !config.xcodeProjectPath) {
                        continue;
                    }

                    await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: `Updating Xcode project...`,
                            cancellable: false,
                        },
                        async (progress) => {
                            try {
                                await executeScript(
                                    `XCODE_PROJECT_PATH="${config.xcodeProjectPath}" PROJECT_PATH="${config.projectPath}" ruby "${context.extensionPath}/scripts/move_in_xcode.rb" "${oldPath}" "${newPath}"`
                                );
                            } catch (error) {
                                console.error('Script execution error:', error);
                                throw error;
                            }
                        }
                    );

                    // Clear the processed paths
                    delete createBuffer[newPath];
                    delete deleteBuffer[oldPath];

                    vscode.window.showInformationMessage(
                        `Successfully moved ${path.basename(oldPath)}`
                    );
                } catch (error) {
                    console.error('Error handling move:', error);
                    vscode.window.showErrorMessage(
                        `Error updating Xcode project: ${error instanceof Error ? error.message : String(error)}`
                    );
                }
            }
        }

        // Final cleanup
        cleanupBuffers();

        if (
            Object.keys(createBuffer).length === 0 &&
            Object.keys(deleteBuffer).length === 0
        ) {
            if (movePromiseResolve) {
                movePromiseResolve();
            }
        }
    };

    // Update the scheduling function
    const scheduleProcessing = () => {
        if (processingTimeout) {
            clearTimeout(processingTimeout);
        }
        processingTimeout = setTimeout(async () => {
            await processMove();
            processingTimeout = null;
        }, 100);
    };

    const watcher = vscode.workspace.createFileSystemWatcher('**/*.swift');
    const folderWatcher = vscode.workspace.createFileSystemWatcher('**/');

    // Update the watchers
    watcher.onDidCreate((uri) => {
        createBuffer[uri.fsPath] = {
            path: uri.fsPath,
            timestamp: Date.now(),
        };
        scheduleProcessing();
    });

    watcher.onDidDelete((uri) => {
        deleteBuffer[uri.fsPath] = {
            path: uri.fsPath,
            timestamp: Date.now(),
        };
        scheduleProcessing();
    });

    folderWatcher.onDidCreate((uri) => {
        createBuffer[uri.fsPath] = {
            path: uri.fsPath,
            timestamp: Date.now(),
        };
        scheduleProcessing();
    });

    folderWatcher.onDidDelete((uri) => {
        deleteBuffer[uri.fsPath] = {
            path: uri.fsPath,
            timestamp: Date.now(),
        };
        scheduleProcessing();
    });

    context.subscriptions.push(watcher);
    context.subscriptions.push(folderWatcher);

    // Handle rename events
    context.subscriptions.push(
        vscode.workspace.onDidRenameFiles(async (event) => {
            for (const { oldUri, newUri } of event.files) {
                const isMove =
                    path.dirname(oldUri.fsPath) !== path.dirname(newUri.fsPath);

                // Skip if it's a move operation - let the move handler deal with it
                if (isMove) {
                    continue;
                }
                try {
                    const config = await getConfiguration(context);
                    if (!config.projectPath || !config.xcodeProjectPath) {
                        continue;
                    }

                    const oldPath = oldUri.fsPath;
                    const newPath = newUri.fsPath;

                    // Check if it's a Swift file or folder
                    const isSwiftFile = oldPath.endsWith('.swift');
                    const isFolder = !path.extname(oldPath);

                    if (!isSwiftFile && !isFolder) {
                        continue;
                    }

                    // Show progress
                    await vscode.window.withProgress(
                        {
                            location: vscode.ProgressLocation.Notification,
                            title: `Updating Xcode project...`,
                            cancellable: false,
                        },
                        async (progress) => {
                            // Execute rename script
                            await executeScript(
                                `XCODE_PROJECT_PATH="${config.xcodeProjectPath}" PROJECT_PATH="${config.projectPath}" ruby "${context.extensionPath}/scripts/rename_in_xcode.rb" "${oldPath}" "${newPath}"`
                            );

                            // Refresh explorer
                            await vscode.commands.executeCommand(
                                'workbench.files.action.refreshFilesExplorer'
                            );
                        }
                    );

                    vscode.window.showInformationMessage(
                        `Successfully renamed`
                    );
                } catch (error) {
                    console.error('Error handling rename:', error);
                    vscode.window.showErrorMessage(
                        `Error updating Xcode project`
                    );
                }
            }
        })
    );

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
