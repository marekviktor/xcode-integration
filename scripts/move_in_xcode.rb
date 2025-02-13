require 'xcodeproj'

def move_in_xcode(old_path, new_path)
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

    is_directory = File.directory?(new_path)

    if is_directory
      # Handle group move
      source_group = find_group(project.main_group, old_relative_path)
      target_group = find_or_create_group(project.main_group, File.dirname(new_relative_path))

      unless source_group
        raise "Source group not found: #{old_relative_path}"
      end

      # Move the group
      source_group.remove_from_project
      target_group.children << source_group
      source_group.path = File.basename(new_path)

    else
      # Handle file move
      file_ref = find_file_reference(project, old_path)
      target_group = find_or_create_group(project.main_group, File.dirname(new_relative_path))

      unless file_ref
        raise "File not found in Xcode project: #{old_path}"
      end

      # Move the file reference
      file_ref.remove_from_project
      target_group.children << file_ref
      file_ref.path = File.basename(new_path)
    end

    # Save the project
    project.save

    puts "Successfully moved in Xcode project: #{old_relative_path} to #{new_relative_path}"

  rescue StandardError => e
    puts "Error: #{e.message}"
    puts e.backtrace.join("\n")
    exit 1
  end
end

def find_group(current_group, path)
  path_components = path.split('/')
  
  return current_group if path_components.empty?
  
  component = path_components.first
  next_group = current_group.children.find { |child| 
    (child.display_name == component || child.path == component) && 
    child.is_a?(Xcodeproj::Project::Object::PBXGroup)
  }
  
  return nil unless next_group
  
  path_components.size == 1 ? next_group : find_group(next_group, path_components[1..-1].join('/'))
end

def find_or_create_group(current_group, path)
  return current_group if path.empty? || path == '.'
  
  path_components = path.split('/')
  component = path_components.first
  
  next_group = current_group.children.find { |child| 
    (child.display_name == component || child.path == component) && 
    child.is_a?(Xcodeproj::Project::Object::PBXGroup)
  }
  
  next_group ||= current_group.new_group(component, component)
  
  path_components.size == 1 ? next_group : find_or_create_group(next_group, path_components[1..-1].join('/'))
end

def find_file_reference(project, path)
  project.files.find { |ref| ref.real_path.to_s == File.absolute_path(path) }
end

# Get paths from command line arguments
if ARGV.length != 2
  puts "Usage: ruby move_in_xcode.rb <old_path> <new_path>"
  exit 1
end

move_in_xcode(ARGV[0], ARGV[1])