require 'xcodeproj'

def rename_in_xcode(old_path, new_path)
  begin
    project_path = ENV['XCODE_PROJECT_PATH']
    
    unless File.exists?(project_path)
      raise "Project file not found at #{project_path}"
    end

    # Open the project
    project = Xcodeproj::Project.open(project_path)

    # Get relative paths from project
    project_dir = File.dirname(project_path)
    old_relative_path = Pathname.new(old_path).relative_path_from(Pathname.new(project_dir)).to_s
    new_relative_path = Pathname.new(new_path).relative_path_from(Pathname.new(project_dir)).to_s

    is_directory = File.directory?(old_path)

    if is_directory
      # Handle group rename
      current_group = project.main_group
      group_to_rename = nil

      old_relative_path.split('/').each do |component|
        next_group = current_group.children.find { |child| 
          child.path == component && child.is_a?(Xcodeproj::Project::Object::PBXGroup)
        }
        
        unless next_group
          raise "Group not found: #{component}"
        end
        
        current_group = next_group
        group_to_rename = next_group
      end

      unless group_to_rename
        raise "Group not found in Xcode project"
      end

      # Update group name and path
      new_name = File.basename(new_path)
      group_to_rename.name = new_name
      group_to_rename.path = new_name

      # Update paths for all child files
      group_to_rename.recursive_children.each do |child|
        if child.is_a?(Xcodeproj::Project::Object::PBXFileReference)
          old_file_path = child.real_path.to_s
          new_file_path = old_file_path.gsub(old_path, new_path)
          child.path = Pathname.new(new_file_path).relative_path_from(Pathname.new(project_dir)).to_s
        end
      end

    else
      # Handle file rename
      file_ref = nil
      project.files.each do |ref|
        if ref.real_path.to_s == File.absolute_path(old_path)
          file_ref = ref
          break
        end
      end

      unless file_ref
        raise "File not found in Xcode project: #{old_path}"
      end

      # Update file reference
      file_ref.path = File.basename(new_path)
    end

    # Save the project
    project.save

    # Perform filesystem rename
    FileUtils.mv(old_path, new_path)

    puts "Successfully renamed: #{old_relative_path} to #{new_relative_path}"

  rescue StandardError => e
    puts "Error: #{e.message}"
    exit 1
  end
end

# Get paths from command line arguments
if ARGV.length != 2
  puts "Usage: ruby rename_in_xcode.rb <old_path> <new_path>"
  exit 1
end

rename_in_xcode(ARGV[0], ARGV[1])