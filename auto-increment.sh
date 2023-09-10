#!/bin/bash

##########################################################
# Use this script to create a new release and deploy app.#
##########################################################


# Input version string
current_version=$(cat package.json | jq '.version')
current_version=$(echo "$current_version" | tr -d '"')

echo "Current version: $current_version"

# Split the version string into parts
IFS='.' read -r -a version_parts <<< "$current_version"

# Increment the last part (patch version)
((version_parts[2]++))

# Join the parts back into a new version string
new_version="${version_parts[0]}.${version_parts[1]}.${version_parts[2]}"

echo "New version: $new_version"

# Update the version using jq
jq ".version = \"$new_version\"" package.json > updated_package.json

# Optionally, replace the original file with the updated one
mv updated_package.json package.json

git add package.json
git commit -m "chore(): release version $new_version"

# Deploy app.
git push
