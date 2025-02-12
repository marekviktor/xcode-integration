# Xcode Integration

Xcode Integration is a Visual Studio Code extension that provides seamless integration with Xcode projects. This extension allows you to create, delete, and manage Swift files and folders directly from VS Code, and sync them with your Xcode project.

## Features

- Create new Swift files with predefined templates.
- Add new folders to your Xcode project.
- Delete Swift files and folders from both the filesystem and Xcode project.
- Auto-detect Xcode project settings.

## Requirements

- Visual Studio Code
- Ruby
- Xcodeproj gem (`gem install xcodeproj`)

## Installation

1. Clone the repository:

    ```sh
    git clone <repository-url>
    cd xcode-integration
    ```

2. Install dependencies:

    ```sh
    npm install
    ```

3. Install the Xcodeproj gem:

    ```sh
    gem install xcodeproj
    ```

## Usage

### Create a New Swift File

1. Right-click on a folder in the VS Code Explorer.
2. Select `Xcode -> New Swift File`.
3. Enter the name of the new Swift file.
4. Choose a template from the list.
5. The new file will be created and added to your Xcode project.

### Add a New Folder

1. Right-click on a folder in the VS Code Explorer.
2. Select `Xcode -> New Folder (Xcode)`.
3. Enter the name of the new folder.
4. The new folder will be created and added to your Xcode project.

### Delete a Swift File

1. Right-click on a Swift file in the VS Code Explorer.
2. Select `Xcode -> Delete File from Xcode Project`.
3. Confirm the deletion.
4. The file will be removed from both the filesystem and Xcode project.

### Delete a Folder

1. Right-click on a folder in the VS Code Explorer.
2. Select `Xcode -> Delete Folder from Xcode Project`.
3. Confirm the deletion.
4. The folder and its contents will be removed from both the filesystem and Xcode project.

## Configuration

You can configure the extension settings in your VS Code settings:

- `xcodeIntegration.projectPath`: Path to your project root folder.
- `xcodeIntegration.xcodeProjectPath`: Path to your .xcodeproj file.
- `xcodeIntegration.authorName`: Author name for file headers.

## Development

To build and run the extension locally:

1. Compile the extension:

    ```sh
    npm run compile
    ```

2. Launch the extension:

    ```sh
    code .
    ```

3. Press `F5` to open a new VS Code window with the extension loaded.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

This project is licensed under the MIT License.