
// Plugins should load their own versions of any libraries used even if those libraries are also used
// by the GeositeFramework, in case a future framework version uses a different library version.

require({
    // Specify library locations.
    // The calls to location.pathname.replace() below prepend the app's root path to the specified library location.
    // Otherwise, since Dojo is loaded from a CDN, it will prepend the CDN server path and fail, as described in
    // https://dojotoolkit.org/documentation/tutorials/1.7/cdn
    packages: [
        {
            name: "d3",
            location: "//d3js.org",
            main: "d3.v3.min"
        }
    ]
});

define([
		"dojo/_base/declare",
		"framework/PluginBase",
		"dojo/parser",
		"dojo/on",
		"dijit/registry",
		"dojo/_base/array",
		"dojo/dom-construct",
		"dojo/query",
		"dojo/dom",
		"dojo/dom-class",
		"dojo/dom-style",
		"dojo/dom-attr",
		 "d3",
		"underscore",
		"./app",
		"dojo/text!plugins/living-shorelines-explorer/data.json",
		"dojo/text!plugins/living-shorelines-explorer/interface.json"
       ],
       function (declare, PluginBase, parser, on, registry, array, domConstruct, query, dom, domClass, domStyle, domAttr, d3, _, tool, appData, appConfig) {
           return declare(PluginBase, {
               toolbarName: "Living Shorelines",
			   fullName: "Living Shorelines",
               toolbarType: "sidebar",
               hasHelp: false,
               showServiceLayersInLegend: true,
               allowIdentifyWhenActive: false,
               plugin_directory: "plugins/living-shorelines-explorer",
			   size:"custom",
               width: 425,
			   _state: {},
			   _firstLoad: true,
			   _saveAndShare: true,

               activate: function () {
					//console.log("activate");
					if (_.isUndefined(this.map.getLayer("ls-layer-0"))) {
						var plugin = this;
						window.setTimeout(function() {
							if (plugin._firstLoad) {
								plugin.tool.loadLayers();
								plugin.tool.showTool();
								if (!_.isEmpty(plugin._state)) {
									plugin.loadState();
									plugin.tool.updateMapLayers();
								}
							}
						}, 1000);
					} else {
						this.tool.showTool();
					}
               },

               deactivate: function () {
                   //console.log("deactivate");
				    if (_.has(this.tool._interface, "includeMinimize") && !this.tool._interface.includeMinimize) {
					   this.tool.closeTool();
				   } else {
					   this.tool.hideTool();
				   }
               },

               hibernate: function () {
				   //console.log("hibernate");
				   this.tool.closeTool();
               },

               initialize: function (frameworkParameters) {
				   //console.log("initialize - plugin");
					var plugin = this;
					declare.safeMixin(this, frameworkParameters);
					  var djConfig = {
						parseOnLoad: true
				    };
				    domClass.add(this.container, "claro");
				    domClass.add(this.container, "plugin-ls");
					this.tool = new tool(this, appData, appConfig);
					tool_ls = this.tool;
					this.tool.initialize(this.tool);
					domStyle.set(this.container.parentNode, {
						"padding": "0px"
					});
               },

               getState: function () {
                   var plugin = this;
				   var state = new Object();
				   
				   state.controls = {};
				   state.controls.selects = {};
				   state.controls.sliders = {};
				   state.controls.checkbox = {};
				   state.controls.radiobutton = {};
				   state.controls.togglebutton = {};
				   state.controls.accordions = {};
				   
                   return state;
                },

               setState: function (data) {
				   this._state = data;
               },
			   
			   loadState: function () {
				   var plugin = this.tool;
				   for (var control in this._state.controls.selects) {
						 for (var property in this._state.controls.selects[control]) {

						 }
					 }

					 for (var slider in this._state.controls.sliders) {
						 for (var property in this._state.controls.sliders[slider]) {
						 
						 }
					 }
					 
					for (var control in this._state.controls.checkbox) {
						 for (var property in this._state.controls.checkbox[control]) {
							 
						 }
					 }
					 
					 for (var control in this._state.controls.radiobutton) {
						 for (var property in this._state.controls.radiobutton[control]) {
							 
						 }
					 }
					 
					 for (var control in this._state.controls.togglebutton) {
						 for (var property in this._state.controls.togglebutton[control]) {
							 
						 }
					 }
					 this._state = {};
			   },

               identify: function(){

               }
           });
       });
