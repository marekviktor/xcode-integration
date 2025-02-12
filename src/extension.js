"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
function activate(context) {
    // Register command for new Swift file
    let newSwiftFile = vscode.commands.registerCommand('xcode-integration.newSwiftFile', async (uri) => {
        try {
            // Get target directory
            const targetDir = uri?.fsPath ||
                (vscode.window.activeTextEditor?.document.uri.fsPath
                    ? path.dirname(vscode.window.activeTextEditor.document.uri.fsPath)
                    : vscode.workspace.workspaceFolders?.[0].uri.fsPath);
            if (!targetDir) {
                throw new Error('No target directory selected');
            }
            // Ask for file name
            const fileName = await vscode.window.showInputBox({
                prompt: "Enter the name of the new Swift file",
                placeHolder: "MyNewFile",
                validateInput: (value) => {
                    if (!value) {
                        return 'File name is required';
                    }
                    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(value)) {
                        return 'Invalid file name. Use alphanumeric characters and underscores, start with a letter';
                    }
                    return null;
                }
            });
            if (!fileName) {
                return;
            }
            const fullPath = path.join(targetDir, `${fileName}.swift`);
            // Create empty file
            fs.writeFileSync(fullPath, '');
            // Show template picker and add to Xcode
            const templates = ['SwiftUI View', 'Swift File', 'Protocol', 'Class', 'ViewModel'];
            const selectedTemplate = await vscode.window.showQuickPick(templates, {
                placeHolder: 'Select a template'
            });
            if (!selectedTemplate) {
                fs.unlinkSync(fullPath); // Clean up if cancelled
                return;
            }
            // Add to Xcode
            await execAsync(`ruby "${context.extensionPath}/scripts/add_to_xcode.rb" "${fullPath}" "${selectedTemplate}"`);
            // Open the new file
            const doc = await vscode.workspace.openTextDocument(fullPath);
            await vscode.window.showTextDocument(doc);
            vscode.window.showInformationMessage(`Created ${fileName}.swift with ${selectedTemplate} template`);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
    // Register command for new folder
    let newFolder = vscode.commands.registerCommand('xcode-integration.newFolder', async (uri) => {
        try {
            // Get target directory
            const targetDir = uri?.fsPath ||
                (vscode.window.activeTextEditor?.document.uri.fsPath
                    ? path.dirname(vscode.window.activeTextEditor.document.uri.fsPath)
                    : vscode.workspace.workspaceFolders?.[0].uri.fsPath);
            if (!targetDir) {
                throw new Error('No target directory selected');
            }
            // Ask for folder name
            const folderName = await vscode.window.showInputBox({
                prompt: "Enter the name of the new folder",
                placeHolder: "MyNewFolder",
                validateInput: (value) => {
                    if (!value) {
                        return 'Folder name is required';
                    }
                    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(value)) {
                        return 'Invalid folder name. Use alphanumeric characters and underscores, start with a letter';
                    }
                    return null;
                }
            });
            if (!folderName) {
                return;
            }
            const fullPath = path.join(targetDir, folderName);
            // Create folder
            fs.mkdirSync(fullPath, { recursive: true });
            // Add to Xcode
            await execAsync(`ruby "${context.extensionPath}/scripts/add_group_to_xcode.rb" "${fullPath}"`);
            vscode.window.showInformationMessage(`Created folder ${folderName} and added to Xcode`);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
    context.subscriptions.push(newSwiftFile);
    context.subscriptions.push(newFolder);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map