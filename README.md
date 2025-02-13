# Xcode Integration for VS Code

A VSCode extension that provides integration with Xcode projects, enabling seamless file/folder management while keeping your Xcode project synchronized.

## Features

- **Xcode Project Sync**

    - Create Swift files with templates (SwiftUI View, Protocol, Class, ViewModel)
    - Create folders that automatically sync with Xcode groups
    - Delete files/folders from both filesystem and Xcode project
    - Automatic handling of renames and moves

- **Templates**

    **SwiftUI View**
    ```swift
    import SwiftUI

    struct %{filename_no_ext}: View {
        var body: some View {
            Text("Hello, World!")
        }
    }

    #Preview {
        %{filename_no_ext}()
    }
    ```

    **Protocol**
    ```swift
    import Foundation

    protocol %{filename_no_ext} {
        // Protocol requirements
    }
    ```

    **Class**
    ```swift
    import Foundation

    class %{filename_no_ext} {
        // Class implementation
    }
    ```

    **ViewModel**
    ```swift
    import Foundation

    class %{filename_no_ext}: ObservableObject {
        // ViewModel properties and methods
    }
    ```

    **Swift File** (minimal template)
    ```swift
    import Foundation
    // Your code here
    ```

- **Configuration**

    - Project path is the path to the project directory.
    - Xcode project path is the path to the Xcode project file.
    - Author name is the name of the author of the project, that will be used in templates when creating new files.

    ```json
    "xcodeIntegration.projectPath": "/path/to/project",
    "xcodeIntegration.xcodeProjectPath": "/path/to/project.xcodeproj",
    "xcodeIntegration.authorName": "Your Name"
    ```
    - Author name is auto-detected from Git config unless specified in the settings.
    - If paths are not specified, the extension will try to automatically detect them.

## Requirements

- macOS only
- Xcode installed
- Ruby gem: `xcodeproj` (auto-installed on activation)

## Installation

1. Install the extension from VS Code Marketplace
2. The extension will automatically:
    ```bash
    gem install xcodeproj --user-install
    ```
    If installation fails, try installing manually.

## Support This Project

If you like the extension, please consider supporting me:

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/marekviktor)

## License
This project is licensed under the [MIT License](LICENSE) - see the [LICENSE](LICENSE) file for details.