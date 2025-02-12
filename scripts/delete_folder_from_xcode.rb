#!/usr/bin/env ruby
require 'xcodeproj'
require 'pathname'
require 'fileutils'

# Get environment variables
xcode_project_path = ENV['XCODE_PROJECT_PATH']
project_path = ENV['PROJECT_PATH']
folder_path = ARGV[0]

begin
  # Open the Xcode project
  project = Xcodeproj::Project.open(xcode_project_path)
  
  # Convert paths to relative format
  relative_folder_path = Pathname.new(folder_path).relative_path_from(Pathname.new(File.dirname(xcode_project_path))).to_s
  
  # Find the main group
  main_group = project.main_group
  
  def find_and_remove_group(parent_group, target_path)
    parent_group.groups.each do |group|
      if group.real_path && group.real_path.to_s.end_with?(target_path)
        # Remove all files in the group recursively
        remove_group_recursive(group)
        # Remove the group itself
        group.remove_from_project
        return true
      end
      
      # Recursively search in subgroups
      if find_and_remove_group(group, target_path)
        return true
      end
    end
    false
  end
  
  def remove_group_recursive(group)
    # Remove all subgroups recursively
    group.groups.each do |subgroup|
      remove_group_recursive(subgroup)
    end
    
    # Remove all file references in the group
    group.files.each do |file_ref|
      if file_ref.real_path
        # Remove the actual file from filesystem
        FileUtils.rm_f(file_ref.real_path.to_s)
        # Remove the reference from project
        file_ref.remove_from_project
      end
    end
  end
  
  # Find and remove the group
  unless find_and_remove_group(main_group, relative_folder_path)
    puts "Warning: Group not found in Xcode project: #{relative_folder_path}"
  end
  
  # Remove the actual folder from filesystem
  FileUtils.rm_rf(folder_path)
  
  # Save the project
  project.save
  
  puts "Successfully removed folder and its contents from Xcode project: #{relative_folder_path}"
rescue StandardError => e
  STDERR.puts "Error: #{e.message}"
  STDERR.puts e.backtrace
  exit 1
end 