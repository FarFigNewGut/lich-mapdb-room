from flask import Flask
from flask import render_template, url_for, request, redirect, jsonify
from PIL import Image
from math import floor
import re
import json
from os import environ as osenv

app = Flask(__name__)
try:
	app.config['SECRET_KEY'] = osenv.get('FLASK_SECRET_KEY')
except KeyError:
	from os import secrets
	app.config['SECRET_KEY'] = secrets.token_hex(16)

with open("app/data/map.json", "r") as f:
    room_data = json.load(f)

rd_dict = {}
for room in room_data:
    rd_dict[room["id"]] = room
    room_uids = room.get("uid")
    if room_uids and type(room_uids) == list:
        for room_uid in room_uids:
            rd_dict[f'u{room_uid}'] = room

with open("app/data/updated_at", "r") as f:
    updated_at = f.read()


@app.errorhandler(404)
def not_found(e):
    return render_template("404.html")


@app.route("/")
def root():
    return render_template("search.html")


@app.route("/u<int:simu_id>")
@app.route("/<int:room_id>")
def room_page(room_id = None, simu_id = None):
    room_box = {"x": 0, "y": 0, "width": 0, "height": 0}
    is_uid = re.search("u[0-9]+\?$", request.full_path)
    if is_uid:
        room_id = f"u{simu_id}"
    room = rd_dict.get(room_id)
    if not room:
        return render_template("404.html", noroom=True)
    orig_ratio = 1
    size_mod = 1
    new_width = new_height = False
    if room.get("image"):
        with Image.open("app/static/maps/" + room["image"]) as img:
            orig_width, orig_height = img.size
        orig_ratio = float(orig_height) / float(orig_width)
        new_width = 700
        new_height = floor(700 * orig_ratio)
        width_ratio = float(new_width) / float(orig_width)
        height_ratio = float(new_height) / float(orig_height)
    if room.get("image_coords"):
        original_x = floor(width_ratio * room["image_coords"][0])
        original_y = floor(height_ratio * room["image_coords"][1])
        original_width = floor(width_ratio * room["image_coords"][2]) - floor(
            width_ratio * room["image_coords"][0]
        )
        original_height = floor(height_ratio * room["image_coords"][3]) - floor(
            height_ratio * room["image_coords"][1]
        )

        # Apply minimum dimensions while maintaining center point
        min_size = 10
        final_width = max(original_width, min_size)
        final_height = max(original_height, min_size)

        # Calculate position adjustment to maintain center
        width_adjustment = (final_width - original_width) / 2
        height_adjustment = (final_height - original_height) / 2

        room_box["x"] = original_x - width_adjustment
        room_box["y"] = original_y - height_adjustment
        room_box["width"] = final_width
        room_box["height"] = final_height
    image_dims = {"width": new_width, "height": new_height}
    room_json_pretty = json.dumps(room, indent=4, sort_keys=True)

    # Get rooms on the same image as current room and collect their tags and locations
    same_image_rooms = []
    image_tags = set()
    image_locations = set()
    if room.get("image"):
        for room_info in room_data:
            if room_info.get("image") == room["image"] and room_info.get("image_coords"):
                same_image_rooms.append(room_info)
                if room_info.get("tags"):
                    image_tags.update(room_info["tags"])
                if room_info.get("location"):
                    image_locations.add(room_info["location"])

    image_tags = sorted(list(image_tags))
    image_locations = sorted(list(image_locations))

    # Create map navigation list with enhanced naming and categorization
    available_maps = {}
    map_categories = {}

    # First pass: collect all maps and find rooms with meta tags
    for room_info in room_data:
        if room_info.get("image") and room_info.get("image_coords"):
            map_image = room_info["image"]

            # Initialize map entry if not exists
            if map_image not in available_maps:
                available_maps[map_image] = {
                    "room_id": room_info["id"],
                    "display_name": map_image,
                    "category": "Other"
                }

            # Check for meta tags
            if room_info.get("tags"):
                for tag in room_info["tags"]:
                    # Check for mapname tag
                    if tag.startswith("meta:mapname:"):
                        map_name = tag.replace("meta:mapname:", "")
                        available_maps[map_image]["display_name"] = map_name
                        available_maps[map_image]["room_id"] = room_info["id"]

                    # Check for mapcategory tag
                    elif tag.startswith("meta:mapcategory:"):
                        category = tag.replace("meta:mapcategory:", "")
                        available_maps[map_image]["category"] = category

    # Group maps by category and sort
    categorized_maps = {}
    for map_image, map_data in available_maps.items():
        category = map_data["category"]
        if category not in categorized_maps:
            categorized_maps[category] = []
        categorized_maps[category].append((map_data["display_name"], map_data["room_id"]))

    # Sort categories and maps within each category
    sorted_categories = []
    for category in sorted(categorized_maps.keys()):
        sorted_maps = sorted(categorized_maps[category])
        sorted_categories.append((category, sorted_maps))

    # Find adjacent maps - maps that are connected via room exits
    adjacent_maps = {}
    if room.get("image"):
        # Get all rooms on current map
        current_map_rooms = [r for r in same_image_rooms]

        # For each room on current map, check their exits
        for current_room in current_map_rooms:
            if current_room.get("wayto"):
                for exit_room_id in current_room["wayto"].keys():
                    # Find the exit room in our data
                    exit_room = rd_dict.get(int(exit_room_id))
                    if exit_room and exit_room.get("image") and exit_room["image"] != room["image"]:
                        # This room connects to a different map
                        adjacent_image = exit_room["image"]
                        if adjacent_image not in adjacent_maps:
                            # Get display name from available_maps if it exists
                            display_name = adjacent_image
                            if adjacent_image in available_maps:
                                display_name = available_maps[adjacent_image]["display_name"]

                            adjacent_maps[adjacent_image] = {
                                "room_id": exit_room["id"],
                                "display_name": display_name
                            }

    # Sort adjacent maps by display name
    sorted_adjacent_maps = sorted(adjacent_maps.items(), key=lambda x: x[1]["display_name"])

    return render_template(
        "room.html",
        room=room,
        room_box=room_box,
        image_dimensions=image_dims,
        room_json_pretty=room_json_pretty,
        updated_at=updated_at,
        image_tags=image_tags,
        image_locations=image_locations,
        same_image_rooms=same_image_rooms,
        available_maps=sorted_categories,
        adjacent_maps=sorted_adjacent_maps,
    )

@app.route("/api/tags")
def get_tags():
	all_tags = set()
	for room in room_data:
		if room.get("tags"):
			all_tags.update(room["tags"])
	return jsonify(sorted(list(all_tags)))

@app.route("/api/images/<tag>")
def get_images_for_tag(tag):
	images = {}
	for room in room_data:
		if room.get("tags") and tag in room["tags"] and room.get("image"):
			image = room["image"]
			if image not in images:
				images[image] = {
					'filename': image,
					'display_name': image  # Default to filename
				}

	# Get display names for maps (check for meta:mapname tags)
	for room_info in room_data:
		if room_info.get('tags') and room_info.get('image'):
			image = room_info['image']
			if image in images:
				for room_tag in room_info['tags']:
					if room_tag.startswith('meta:mapname:'):
						map_name = room_tag.replace('meta:mapname:', '')
						images[image]['display_name'] = map_name
						break

	# Convert to list sorted by display name
	result = [images[img] for img in sorted(images.keys(), key=lambda x: images[x]['display_name'])]
	return jsonify(result)

@app.route("/api/locations/<image>")
def get_locations_for_image(image):
	tag = request.args.get('tag')
	locations = set()
	for room in room_data:
		image_match = room.get("image") == image
		location_exists = room.get("location")
		tag_match = not tag or (room.get("tags") and tag in room["tags"])

		if image_match and location_exists and tag_match:
			locations.add(room["location"])
	return jsonify(sorted(list(locations)))

@app.route("/search", methods=('GET', 'POST'))
def search():
	if request.method == 'POST':
		# Handle tag+image combination search
		if 'tag' in request.form and 'image' in request.form:
			tag = request.form['tag']
			image = request.form['image']
			location = request.form.get('location', '')

			for room in room_data:
				tag_match = room.get("tags") and tag in room["tags"]
				image_match = room.get("image") == image
				location_match = not location or room.get("location") == location

				if tag_match and image_match and location_match:
					url_params = {'room_id': room["id"], 'highlight_tag': tag}
					if location:
						url_params['highlight_location'] = location
					return redirect(url_for('room_page', **url_params))
			return render_template('search.html', results={}, overflow=False)

		# Handle text search
		search = request.form['search'].strip().lower()
		overflow = False
		try:
			room = rd_dict.get(int(search))
			return redirect(url_for('room_page', room_id=search))
		except ValueError:
			room = rd_dict.get(search)
			if room:
				return redirect(url_for('room_page', simu_id=search.replace("u", "")))
		room_list = {}
		map_filter = request.form.get('map_filter')

		# First, search by tags (exact match)
		for rinfo in room_data:
			rid = rinfo.get("id", "wut")
			if search in rinfo.get('tags', []):
				# Apply map filter if specified
				if map_filter is not None:
					if map_filter == 'UNMAPPED':
						if rinfo.get('image'):  # Has image, skip for unmapped search
							continue
					elif map_filter != '' and rinfo.get('image') != map_filter:  # Specific map filter
						continue
				room_list[rid] = rinfo

		# If no tag matches, search titles and descriptions
		if not room_list:
			for rinfo in room_data:
				rid = rinfo.get('id', "wut")
				# Apply map filter if specified
				if map_filter is not None:
					if map_filter == 'UNMAPPED':
						if rinfo.get('image'):  # Has image, skip for unmapped search
							continue
					elif map_filter != '' and rinfo.get('image') != map_filter:  # Specific map filter
						continue

				# Search in titles
				for title in rinfo.get('title', {}):
					title_check = re.search(re.escape(search), title, re.IGNORECASE)
					if title_check:
						room_list[rid] = rinfo
						break
				if room_list.get(rid):
					continue

				# Search in descriptions
				for desc in rinfo.get('description', {}):
					desc_check = re.search(re.escape(search), desc, re.IGNORECASE)
					if desc_check:
						room_list[rid] = rinfo
						break

		# If single result, redirect directly
		if len(room_list) == 1:
			return redirect(url_for('room_page', room_id=list(room_list.keys())[0]))

		# If more than 100 results and no map filter, group by maps
		if len(room_list) > 100 and not map_filter:
			map_groups = {}
			unmapped_count = 0

			for rid, rinfo in room_list.items():
				image = rinfo.get('image')
				if image:
					if image not in map_groups:
						map_groups[image] = {
							'count': 0,
							'display_name': image,
							'sample_room': rid
						}
					map_groups[image]['count'] += 1
				else:
					unmapped_count += 1

			# Get display names for maps (check for meta:mapname tags)
			for room_info in room_data:
				if room_info.get('tags') and room_info.get('image'):
					image = room_info['image']
					if image in map_groups:
						for tag in room_info['tags']:
							if tag.startswith('meta:mapname:'):
								map_name = tag.replace('meta:mapname:', '')
								map_groups[image]['display_name'] = map_name
								break

			return render_template('search.html', 
								 results=None, 
								 map_groups=map_groups, 
								 unmapped_count=unmapped_count,
								 search_term=search,
								 total_results=len(room_list),
								 overflow=False)

		# Normal results display (≤100 results or map-filtered results)
		overflow = len(room_list) > 100 and not map_filter
		if overflow:
			# Limit to first 100 for display
			room_list = dict(list(room_list.items())[:100])

		return render_template('search.html', results=room_list, overflow=overflow, search_term=search)
	else:
		return render_template('search.html', results=None, overflow=False)

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=8000)
