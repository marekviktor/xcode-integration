require 'xcodeproj'

# Configuration
AUTHOR_NAME = ENV['XCODE_AUTHOR_NAME']
XCODE_PROJECT_PATH = ENV['XCODE_PROJECT_PATH']
PROJECT_PATH = ENV['PROJECT_PATH']

def get_target_for_path(project, folder_path)
  relative_path = Pathname.new(folder_path).relative_path_from(Pathname.new(PROJECT_PATH)).to_s
  target_folder = relative_path.split('/').first
  
  matching_target = project.targets.find { |t| t.name == target_folder }
  
  unless matching_target
    puts "Warning: No target found matching folder '#{target_folder}', using first target"
    matching_target = project.targets.first
  end
  
  matching_target
end

def add_group_to_xcode(folder_path)
  begin
    unless File.directory?(folder_path)
      raise "Path is not a directory: #{folder_path}"
    end

    project_path = XCODE_PROJECT_PATH
    
    unless File.exists?(project_path)
      raise "Project file not found at #{project_path}"
    end

    # Open the project
    project = Xcodeproj::Project.open(project_path)

    # Get the target based on path
    target = get_target_for_path(project, folder_path)
    
    unless target
      raise "No target found in project"
    end

    # Extract the relative path from the project root
    project_dir = File.dirname(project_path)
    relative_path = Pathname.new(folder_path).relative_path_from(Pathname.new(project_dir)).to_s

    # Split the path into components
    path_components = relative_path.split('/')

    # Start from main group
    current_group = project.main_group

    # Create or navigate through groups based on path components
    path_components.each do |component|
      next_group = current_group.children.find { |child| 
        child.path == component && child.is_a?(Xcodeproj::Project::Object::PBXGroup)
      }
      if next_group.nil?
        next_group = current_group.new_group(component, component)
        puts "Created new group: #{component}"
      else
        puts "Found existing group: #{component}"
      end
      current_group = next_group
    end

    # Save the project
    project.save

    puts "Success: Group '#{relative_path}' added to project"

  rescue StandardError => e
    puts "Error: #{e.message}"
    exit 1
  end
end

# Get folder path from command line argument
if ARGV.length != 1
  puts "Usage: ruby add_group_to_xcode.rb <folder_path>"
  exit 1
end

add_group_to_xcode(ARGV[0])