import { execSync } from 'child_process';
import { platform } from 'os';

function checkXcodeprojInstallation() {
    // Only run on macOS
    if (platform() !== 'darwin') {
        return;
    } else {
        console.log('This extension is only available on macOS.');
    }

    try {
        // Check if xcodeproj is installed
        execSync('gem list xcodeproj -i', { stdio: 'ignore' });
    } catch (error) {
        console.log('xcodeproj gem is not installed. Attempting to install...');
        try {
            execSync('gem install xcodeproj --user-install', {
                stdio: 'inherit',
            });
            console.log('xcodeproj installed successfully');
        } catch (installError) {
            console.error('Failed to install xcodeproj:', installError.message);
            console.log(
                'Please install xcodeproj manually: gem install xcodeproj'
            );
        }
    }
}

checkXcodeprojInstallation();
