L.Control.Pegman = L.Control.extend({
	includes: L.Evented ? L.Evented.prototype : L.Mixin.Events,
	options: {
		position: 'bottomright',
		theme: "leaflet-pegman-v3-default", // or "leaflet-pegman-v3-small"
		debug: true,
	},

	__interactURL: 'https://unpkg.com/interactjs@1.2.9/dist/interact.min.js',

	initialize: function(options) {

		if (typeof options.logging !== "undefined") options.debug = options.logging;

		L.Util.setOptions(this, options);

		// Grab Left/Right/Up/Down Direction of Mouse for Pegman Image
		this._mousePos = {
			direction: {},
			old: {},
		};

		this._pegmanMarkerCoords = null;

		this._dropzoneMapOpts = {
			accept: '.draggable', // Only Accept Elements Matching this CSS Selector
			overlap: 0.75, // Require a 75% Element Overlap for a Drop to be Possible
			ondropactivate: L.bind(this.onDropZoneActivated, this),
			ondragenter: L.bind(this.onDropZoneDragEntered, this),
			ondragleave: L.bind(this.onDropZoneDragLeaved, this),
			ondrop: L.bind(this.onDropZoneDropped, this),
			ondropdeactivate: L.bind(this.onDropZoneDeactivated, this),
		};
		this._draggableMarkerOpts = {
			inertia: false,
			onmove: L.bind(this.onDraggableMove, this),
			onend: L.bind(this.onDraggableEnd, this),
		};

		this._pegmanMarkerOpts = {
			draggable: true,
			icon: L.icon({
				className: "pegman-marker",
				iconSize: [52, 52],
				iconAnchor: [26, 13],
				iconUrl: 'data:image/png;base64,' + "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAFElEQVR4XgXAAQ0AAABAMP1L30IDCPwC/o5WcS4AAAAASUVORK5CYII=",
			}),
		};
	},

	onAdd: function(map) {
		this._map = map;

		this._container = L.DomUtil.create('div', 'leaflet-pegman pegman-control leaflet-bar');
		this._pegman = L.DomUtil.create('div', 'pegman draggable drag-drop', this._container);
		this._pegmanButton = L.DomUtil.create('div', 'pegman-button', this._container);
		this._pegmanMarker = L.marker([0, 0], this._pegmanMarkerOpts);

		L.DomUtil.addClass(this._map._container, this.options.theme);
		L.DomEvent.on(this._container, 'click mousedown dblclick', this._disableClickPropagation, this);

		this._container.addEventListener('touchstart', this._loadScripts.bind(this, !L.Browser.touch), { once: true });
		this._container.addEventListener('mousedown', this._loadScripts.bind(this, true), { once: true });
		this._container.addEventListener('mouseover', this._loadScripts.bind(this, false), { once: true });


		this._loadInteractHandlers();

		L.DomEvent.on(document, 'mousemove', this.mouseMoveTracking, this);
		L.DomEvent.on(document, 'keyup', this.keyUpTracking, this);

		this._pegmanMarker.on("dragend", this.onPegmanMarkerDragged, this);
		this._pegmanMarker.on("click", this.pegmanRemove, this);
		this._pegmanMarker.bindTooltip('',{
					direction: 'top',
					className: 'pegman-marker-tooltip'
				}).openTooltip;
		return this._container ;

	},
	onRemove: function(map) {
		if (this._pegmanMarker) this._pegmanMarker.remove();

		L.DomEvent.off(document, 'mousemove', this.mouseMoveTracking, this);
		L.DomEvent.off(document, 'keyup', this.keyUpTracking, this);

		map.off("mousemove", this._setMouseCursor, this);
	},

	_log: function(args) {
		if (this.options.debug) {
			console.log(args);
		}
	},

	_addClasses: function(el, classNames) {
		classNames = classNames.split(" ");
		for (var s in classNames) {
			L.DomUtil.addClass(el, classNames[s]);
		}
	},

	_removeClasses: function(el, classNames) {
		classNames = classNames.split(" ");
		for (var s in classNames) {
			L.DomUtil.removeClass(el, classNames[s]);
		}
	},

	_removeAttributes: function(el, attrNames) {
		for (var a in attrNames) {
			el.removeAttribute(attrNames[a]);
		}
	},

	/*_insertAfter: function(targetNode, newNode) {
		targetNode.parentNode.insertBefore(newNode, targetNode.nextSibling);
	},*/

	_translateElement: function(el, dx, dy) {
		if (dx === false && dy === false) {
			this._removeAttributes(this._pegman, ["style", "data-x", "data-y"]);
		}
		// Element's position is preserved within the data-x/data-y attributes
		var x = (parseFloat(el.getAttribute('data-x')) || 0) + dx;
		var y = (parseFloat(el.getAttribute('data-y')) || 0) + dy;

		// Translate element
		el.style.webkitTransform = el.style.transform = 'translate(' + x + 'px, ' + y + 'px)';

		// Update position attributes
		el.setAttribute('data-x', x);
		el.setAttribute('data-y', y);
	},

	_updateClasses: function(action) {
		switch (action) {
			case "pegman-dragging":
				this._removeClasses(this._pegman, "dropped");
				this._addClasses(this._container, "dragging");
				break;
			case "pegman-dragged":
				this._removeClasses(this._pegman, "can-drop dragged left right active dropped");
				this._removeAttributes(this._pegman, ["style", "data-x", "data-y"]);
				break;
			case "dropzone-actived":
				this._addClasses(this._map._container, "drop-active");
				break;
			case "dropzone-drag-entered":
				this._addClasses(this._pegman, "active can-drop");
				this._addClasses(this._map._container, "drop-target");
				break;
			case "dropzone-drag-leaved":
				this._removeClasses(this._map._container, "drop-target");
				this._removeClasses(this._pegman, "can-drop");
				break;
			case "dropzone-drop":
				this._removeClasses(this._container, "dragging");
				this._removeClasses(this._pegman, "active left right");
				this._addClasses(this._pegman, "dropped");
				this._removeClasses(this._pegman, "can-drop dragged left right active dropped");
				break;
			case "dropzone-deactivated":
				this._removeClasses(this._pegman, "active left right");
				this._removeClasses(this._map._container, "drop-active drop-target");
				break;
			case "mousemove-top":
				this._addClasses(this._pegman, "top");
				this._removeClasses(this._pegman, "bottom right left");
				break;
			case "mousemove-bottom":
				this._addClasses(this._pegman, "bottom");
				this._removeClasses(this._pegman, "top right left");
				break;
			case "mousemove-left":
				this._addClasses(this._pegman, "left");
				this._removeClasses(this._pegman, "right top bottom");
				break;
			case "mousemove-right":
				this._addClasses(this._pegman, "right");
				this._removeClasses(this._pegman, "left top bottom");
				break;
			case "pegman-added":
				this._addClasses(this._container, "active");
				break;
			case "pegman-removed":
				this._removeClasses(this._container, "active");
				break;
			default:
				throw "Unhandled event:" + action;
		}
		this.fire("svpc_" + action);
	},

	onDraggableMove: function(e) {
		this.mouseMoveTracking(e);
		this.pegmanRemove();
		this._updateClasses("pegman-dragging");
		this._translateElement(this._pegman, e.dx, e.dy);
	},

	onDraggableEnd: function(e) {
		this._pegmanMarkerCoords = this._map.mouseEventToLatLng(e);
		this.pegmanAdd();
		this._updateClasses("pegman-dragged");
	},

	onDropZoneActivated: function(e) {
		this._updateClasses("dropzone-actived");
	},

	onDropZoneDragEntered: function(e) {
		this._updateClasses("dropzone-drag-entered");
	},

	onDropZoneDragLeaved: function(e) {
		this._updateClasses("dropzone-drag-leaved");
	},

	onDropZoneDropped: function(e) {
		this._updateClasses("dropzone-drop");
		this._translateElement(this._pegman, false, false);
	},

	onDropZoneDeactivated: function(e) {
		this._updateClasses("dropzone-deactivated");
	},

	onPegmanMarkerDragged: function(e) {
		this._pegmanMarkerCoords = this._pegmanMarker.getLatLng();
		this.findStreetViewData(this._pegmanMarkerCoords.lat, this._pegmanMarkerCoords.lng);
	},

	clear: function() {
		this.pegmanRemove();
	},

	pegmanAdd: function() {
		this._pegmanMarker.addTo(this._map);
		this._pegmanMarker.setLatLng(this._pegmanMarkerCoords);
		this.findStreetViewData(this._pegmanMarkerCoords.lat, this._pegmanMarkerCoords.lng);
		this._updateClasses("pegman-added");
	},

	pegmanRemove: function() {
		this._pegmanMarker.removeFrom(this._map);
		this._updateClasses("pegman-removed");
	},

	findStreetViewData: function(lat, lng) {
		this._pegmanMarker.setTooltipContent('StreetView va s\'ouvrir dans un nouvel onglet');
		var tooltip = this._pegmanMarker;
		setTimeout(function(){
			//window.open('https://www.google.com/maps?layer=c&cbll=' + lat + ',' + lng + '');
			tooltip.setTooltipContent('Vous pouvez me déplacer ou<br />me cliquer pour me supprimer');
		},1250);
	},

	/**
	 * mouseMoveTracking
	 * @desc internal function used to style pegman while dragging
	 */
	mouseMoveTracking: function(e) {
		var mousePos = this._mousePos;

		// Top <--> Bottom
		if (e.pageY < mousePos.old.y) {
			mousePos.direction.y = 'top';
			this._updateClasses("mousemove-top");
		} else if (e.pageY > mousePos.old.y) {
			mousePos.direction.y = 'bottom';
			this._updateClasses("mousemove-bottom");
		}
		// Left <--> Right
		if (e.pageX < mousePos.old.x) {
			mousePos.direction.x = 'left';
			this._updateClasses("mousemove-left");
		} else if (e.pageX > mousePos.old.x) {
			mousePos.direction.x = 'right';
			this._updateClasses("mousemove-right");
		}

		mousePos.old.x = e.pageX;
		mousePos.old.y = e.pageY;
	},

	/**
	 * keyUpTracking
	 * @desc internal function used to track keyup events
	 */
	keyUpTracking: function(e) {
		if (e.keyCode == 27) {
			this._log('escape pressed');
			this.clear();
		}
	},

	_disableClickPropagation: function(e) {
		L.DomEvent.stopPropagation(e);
		L.DomEvent.preventDefault(e);
	},

	_loadInteractHandlers: function() {
		// TODO: trying to replace "interact.js" with default "L.Draggable" object
		// var draggable = new L.Draggable(this._container);
		// draggable.enable();
		// draggable.on('drag', function(e) { console.log(e); });
		if (typeof interact !== 'function') return;

		// Enable Draggable Element to be Dropped into Map Container
		this._draggable = interact(this._pegman).draggable(this._draggableMarkerOpts);
		this._dropzone = interact(this._map._container).dropzone(this._dropzoneMapOpts);

		this._draggable.styleCursor(false);

		// Prevent map drags (Desktop / Mobile) while dragging pegman control
		L.DomEvent.on(this._container, "touchstart", function(e) { this._map.dragging.disable(); }, this);
		L.DomEvent.on(this._container, "touchend", function(e) { this._map.dragging.enable(); }, this);
	},

	_loadScripts: function() {
		this._loadJS(this.__interactURL, this._loadInteractHandlers.bind(this), typeof interact !== 'function');
	},

	_loadJS: function(url, callback, condition) {
		if (!condition) {
			callback();
			return;
		}
		if (url.indexOf('callback=?') !== -1) {
			this._jsonp(url, callback);
		} else {
			var script = document.createElement('script');
			script.src = url;
			var loaded = function() {
				script.onload = script.onreadystatechange = null;
				this._log(url + " loaded");
				callback();
			}.bind(this);
			script.onload = script.onreadystatechange = loaded;

			var head = document.head || document.getElementsByTagName('head')[0] || document.documentElement;
			head.insertBefore(script, head.firstChild);
		}
	}

});

L.control.pegman = function(options) {
	return new L.Control.Pegman(options);
};
