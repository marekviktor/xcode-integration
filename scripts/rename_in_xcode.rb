# scripts/rename_in_xcode.rb
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

    is_directory = File.directory?(new_path) # Use new_path as old_path might not exist anymore

    if is_directory
      # Handle group rename
      current_group = project.main_group
      parent_group = project.main_group
      group_to_rename = nil
      path_components = old_relative_path.split('/')

      # Navigate through the group hierarchy
      path_components.each_with_index do |component, index|
        next_group = current_group.children.find { |child| 
          (child.display_name == component || child.path == component) && 
          child.is_a?(Xcodeproj::Project::Object::PBXGroup)
        }
        
        unless next_group
          raise "Group not found: #{component} in path: #{old_relative_path}"
        end
        
        if index == path_components.length - 1
          group_to_rename = next_group
        else
          parent_group = current_group
          current_group = next_group
        end
      end

      unless group_to_rename
        raise "Group not found in Xcode project: #{old_relative_path}"
      end

      # Update group name and path
      new_name = File.basename(new_path)
      group_to_rename.name = new_name
      group_to_rename.path = new_name

      # Update paths for all child files if needed
      group_to_rename.recursive_children.each do |child|
        if child.is_a?(Xcodeproj::Project::Object::PBXFileReference)
          # Update the file reference path if necessary
          old_file_path = child.real_path.to_s
          if old_file_path.start_with?(old_path)
            new_file_path = old_file_path.sub(old_path, new_path)
            relative_path = Pathname.new(new_file_path).relative_path_from(Pathname.new(project_dir)).to_s
            child.path = File.basename(relative_path)
          end
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

      # Update file reference with new name
      new_name = File.basename(new_path)
      file_ref.path = new_name
    end

    # Save the project
    project.save

    puts "Successfully updated Xcode project: #{old_relative_path} to #{new_relative_path}"

  rescue StandardError => e
    puts "Error: #{e.message}"
    puts e.backtrace.join("\n") # Add stack trace for debugging
    exit 1
  end
end

# Get paths from command line arguments
if ARGV.length != 2
  puts "Usage: ruby rename_in_xcode.rb <old_path> <new_path>"
  exit 1
end

rename_in_xcode(ARGV[0], ARGV[1])