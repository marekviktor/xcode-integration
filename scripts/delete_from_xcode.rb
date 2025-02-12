require 'xcodeproj'

def delete_from_xcode(file_path)
  begin
    # Path to your .xcodeproj file
    project_path = ENV['XCODE_PROJECT_PATH']
    
    unless File.exists?(project_path)
      raise "Project file not found at #{project_path}"
    end

    # Open the project
    project = Xcodeproj::Project.open(project_path)

    # Get relative path from project
    project_dir = File.dirname(project_path)
    relative_path = Pathname.new(file_path).relative_path_from(Pathname.new(project_dir)).to_s

    # Find the file reference
    file_ref = nil
    project.files.each do |ref|
      if ref.real_path.to_s == File.absolute_path(file_path)
        file_ref = ref
        break
      end
    end

    unless file_ref
      raise "File not found in Xcode project: #{file_path}"
    end

    # Remove from targets
    project.targets.each do |target|
      target.source_build_phase.files.each do |build_file|
        if build_file.file_ref == file_ref
          target.source_build_phase.remove_build_file(build_file)
        end
      end
    end

    # Remove the file reference
    file_ref.remove_from_project

    # Save the project
    project.save

    # Delete the actual file
    File.delete(file_path) if File.exist?(file_path)

    puts "Successfully removed #{relative_path} from project"

  rescue StandardError => e
    puts "Error: #{e.message}"
    exit 1
  end
end

# Get file path from command line argument
if ARGV.length != 1
  puts "Usage: ruby delete_from_xcode.rb <file_path>"
  exit 1
end

delete_from_xcode(ARGV[0])