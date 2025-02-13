require 'xcodeproj'

def delete_group_from_xcode(folder_path)
  begin
    project_path = ENV['XCODE_PROJECT_PATH']
    
    unless File.exists?(project_path)
      raise "Project file not found at #{project_path}"
    end

    # Open the project
    project = Xcodeproj::Project.open(project_path)

    # Get relative path from project
    project_dir = File.dirname(project_path)
    relative_path = Pathname.new(folder_path).relative_path_from(Pathname.new(project_dir)).to_s

    # Find the group
    current_group = project.main_group
    group_to_delete = nil

    relative_path.split('/').each do |component|
      next_group = current_group.children.find { |child| 
        child.path == component && child.is_a?(Xcodeproj::Project::Object::PBXGroup)
      }
      
      unless next_group
        raise "Group not found: #{component}"
      end
      
      current_group = next_group
      group_to_delete = next_group
    end

    unless group_to_delete
      raise "Group not found in Xcode project"
    end

    # Remove files from targets
    files_to_remove = []
    group_to_delete.recursive_children.each do |child|
      if child.is_a?(Xcodeproj::Project::Object::PBXFileReference)
        files_to_remove << child
      end
    end

    # Remove files from build phases
    project.targets.each do |target|
      target.source_build_phase.files.each do |build_file|
        if files_to_remove.include?(build_file.file_ref)
          target.source_build_phase.remove_build_file(build_file)
        end
      end
    end

    # Remove the group
    group_to_delete.remove_from_project

    # Save the project
    project.save

    # Delete the actual folder
    require 'fileutils'
    FileUtils.rm_rf(folder_path) if File.directory?(folder_path)

    puts "Successfully removed group and folder: #{relative_path}"

  rescue StandardError => e
    puts "Error: #{e.message}"
    exit 1
  end
end

# Get folder path from command line argument
if ARGV.length != 1
  puts "Usage: ruby delete_group_from_xcode.rb <folder_path>"
  exit 1
end

delete_group_from_xcode(ARGV[0])