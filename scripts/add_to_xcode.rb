require 'xcodeproj'

# Configuration
AUTHOR_NAME = ENV['XCODE_AUTHOR_NAME']
XCODE_PROJECT_PATH = ENV['XCODE_PROJECT_PATH']
PROJECT_PATH = ENV['PROJECT_PATH']

TEMPLATES = {
  "SwiftUI View" => <<~TEMPLATE,
    import SwiftUI

    struct %{filename_no_ext}: View {
        var body: some View {
            Text("Hello, World!")
        }
    }

    #Preview {
        %{filename_no_ext}()
    }
  TEMPLATE

  "Swift File" => <<~TEMPLATE,
    import Foundation
    
  TEMPLATE

  "Protocol" => <<~TEMPLATE,
    import Foundation

    protocol %{filename_no_ext} {
        
    }
  TEMPLATE

  "Class" => <<~TEMPLATE,
    import Foundation

    class %{filename_no_ext} {
        
    }
  TEMPLATE

  "ViewModel" => <<~TEMPLATE,
    import Foundation

    class %{filename_no_ext}: ObservableObject {
        
    }
  TEMPLATE
}

def get_author_name
  AUTHOR_NAME || 
    begin
      git_name = `git config user.name`.strip
      return git_name unless git_name.empty?
    rescue
      nil
    end ||
    ENV['USER'] || 
    ENV['USERNAME'] || 
    `whoami`.strip
end

def get_target_for_path(project, file_path)
  relative_path = Pathname.new(file_path).relative_path_from(Pathname.new(PROJECT_PATH)).to_s
  target_folder = relative_path.split('/').first
  
  matching_target = project.targets.find { |t| t.name == target_folder }
  
  unless matching_target
    puts "Warning: No target found matching folder '#{target_folder}', using first target"
    matching_target = project.targets.first
  end
  
  matching_target
end

def add_file_to_xcode(file_path, template_type)
  begin
    project_path = XCODE_PROJECT_PATH
    
    unless File.exists?(project_path)
      raise "Project file not found at #{project_path}"
    end

    project = Xcodeproj::Project.open(project_path)
    target = get_target_for_path(project, file_path)
    
    unless target
      raise "No target found in project"
    end

    unless File.exists?(file_path)
      raise "Source file not found at #{file_path}"
    end

    author_name = get_author_name
    filename = File.basename(file_path)
    filename_no_ext = File.basename(file_path, ".*")
    target_name = target.name
    current_date = Time.now.strftime("%d/%m/%Y")
    
    file_header = <<~HEADER
      //
      //  #{filename}
      //  #{target_name}
      //
      //  Created by #{author_name} on #{current_date}
      //

    HEADER

    # Get template content
    template_content = TEMPLATES[template_type] || ""
    template_content = template_content % { filename_no_ext: filename_no_ext }

    # Combine header and content
    final_content = file_header + template_content

    # Write to file
    File.write(file_path, final_content)

    # Project organization
    project_dir = File.dirname(project_path)
    relative_path = Pathname.new(file_path).relative_path_from(Pathname.new(project_dir)).to_s
    path_components = relative_path.split('/')
    filename = path_components.pop
    
    current_group = project.main_group
    path_components.each do |component|
      next_group = current_group.children.find { |child| 
        child.path == component && child.is_a?(Xcodeproj::Project::Object::PBXGroup)
      }
      if next_group.nil?
        next_group = current_group.new_group(component, component)
      end
      current_group = next_group
    end

    existing_file = current_group.files.find { |f| f.path == filename }
    if existing_file
      puts "Warning: File '#{filename}' already exists in group '#{current_group.display_name}'"
      return
    end

    file_ref = current_group.new_file(filename)
    target.add_file_references([file_ref])
    project.save

    puts "Success: #{template_type} '#{filename}' added to group '#{current_group.display_name}' in target '#{target.name}'"

  rescue StandardError => e
    puts "Error: #{e.message}"
    exit 1
  end
end

# Get file path and template type from command line arguments
if ARGV.length != 2
  puts "Usage: ruby add_to_xcode.rb <file_path> <template_type>"
  exit 1
end

file_path = ARGV[0]
template_type = ARGV[1]

add_file_to_xcode(file_path, template_type)