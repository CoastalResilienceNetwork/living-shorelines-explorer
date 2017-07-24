
define([
	    "dojo/_base/declare",
		"d3",
		"use!underscore",
		"dojo/json",
		"dojo/parser",
		"dojo/on",
		"dojo/aspect",
		"dojo/_base/array",
		"dojo/_base/html",
		"dojo/_base/window",
		"dojo/query",
		"dojo/dom",
		"dojo/dom-class",
		"dojo/dom-style",
		"dojo/dom-attr",
		"dojo/dom-construct",
		"dojo/dom-geometry",
		"dojo/_base/fx",
		"dojo/fx",
		"dojox/fx",
		"dijit/registry",
		"dijit/layout/ContentPane",
		"dijit/TitlePane",
		"dijit/layout/AccordionContainer",
		"dojox/widget/TitleGroup",
		"dijit/form/HorizontalSlider",
		"dijit/form/HorizontalRuleLabels",
		"esri/layers/ArcGISDynamicMapServiceLayer",
		"esri/layers/FeatureLayer",
		"esri/layers/GraphicsLayer",
		"esri/graphic",
		"esri/tasks/query",
		"esri/tasks/QueryTask",
		"esri/geometry/Extent",
		"dojo/NodeList-traverse"
		], 


	function (declare,
			d3,
			_, 
			JSON,
			parser,
			on,
			aspect,
			array,
			html,
			win,			
			query,
			dom,
			domClass,
			domStyle,
			domAttr,
			domConstruct,
			domGeom,
			fx,
			coreFx,
			xFx,
			registry,
			ContentPane,
			TitlePane,
			AccordionContainer,
			TitleGroup,
			HorizontalSlider,
			HorizontalRuleLabels,
			DynamicMapServiceLayer,
			FeatureLayer,
			GraphicsLayer,
			Graphic,
			Query,
			QueryTask,
			Extent
		  ) 
		
		{

		var tool = function(plugin, appData, appConfig){
			var self = this;
			this._plugin = plugin;
			this._app = this._plugin.app;
			this._container = this._plugin.container;
			this._plugin_directory = this._plugin.plugin_directory;
			this._legend = this._plugin.legendContainer;
			this._map = this._plugin.map;
			this._mapLayers = {};
			this._mapLayer = {};
			this._featureLayer = {};
			this._mapLayers_closeState = {};
			this._extent = {
				"xmin": 0,
				"ymin": 0,
				"xmax": 0,
				"ymax": 0,
				"spatialReference": {
					"wkid": 102100,
					"latestWkid": 3857
				}
			};
			this._data = JSON.parse(appData);
			this._interface = JSON.parse(appConfig);
			this._firstLoad = this._plugin._firstLoad;
			this._defaultLabels = {
				
			}
			this._defaultTitles = {
				
			}
			this.featureLayerScale = 36112;

			this.initialize = function(){
				//console.log("initialize - container");
				
				this._extent.xmin = _.min(dojo.map(_.keys(this._interface.region), function(region) { return self._interface.region[region].extent.xmin; }));
				this._extent.ymin = _.min(dojo.map(_.keys(this._interface.region), function(region) { return self._interface.region[region].extent.ymin; }));
				this._extent.xmax = _.max(dojo.map(_.keys(this._interface.region), function(region) { return self._interface.region[region].extent.xmax; }));
				this._extent.ymax = _.max(dojo.map(_.keys(this._interface.region), function(region) { return self._interface.region[region].extent.ymax; }));
				
				domStyle.set(this._container, {
					"padding": "0px"
				});
				
				var node = _.first(query("#" + this._container.parentNode.id + " .sidebar-nav"));
				this.infoGraphicButton = domConstruct.create("button", {
					class: "button button-default plugin-ls info-graphic",
					style: "display:none",
					innerHTML: '<img src="' + this._plugin_directory + '/InfographicIcon_v1_23x23.png" alt="show overview graphic">'
				}, node, "first")
				
				if (_.has(this._interface, "infoGraphic")) {
					domAttr.set(this.infoGraphicButton, "data-popup", JSON.stringify(this._interface.infoGraphic.popup));
					domAttr.set(this.infoGraphicButton, "data-url", this._interface.infoGraphic.url);
					
					var display = (this._interface.infoGraphic.show) ? "block" : "none";
					domStyle.set(this.infoGraphicButton, "display", display);
				}
				
				/* on(this.infoGraphicButton, "mouseover", function(){
					self.showMessageDialog(this, "Learn more");
				})
				
				on(this.infoGraphicButton, "mouseout", function(){
					self.hideMessageDialog();
				}) */
				
				var plugin = this;
				on(this.infoGraphicButton, "click", function(c){
					var popup = JSON.parse(domAttr.get(this, "data-popup"));
					var url = domAttr.get(this, "data-url");
					if (popup) {
						var html = self._interface.infoGraphic.html.replace("PLUGIN-DIRECTORY", plugin._plugin_directory);;
						TINY.box.show({
							animate: true,
							html: html,
							fixed: true,
							width: 860,
							height: 690
						});
					} else {
						window.open(url, "_blank");
					}
					
				})
				
				var loadingDiv = domConstruct.create("div", {
					innerHTML:"<i class='fa fa-spinner fa-spin fa-3x fa-fw'></i>",
					style:"position:absolute; left: 110px; top:50%; width:100px; height:100px; line-height:100px; text-align:center;"
				}, this._container);
				
				this.loadLayers();
				this.loadLayerStats();
				this.loadInterface(this);
			}
			
			this.showTool = function(){
				if (this._region != "") {
					this.updateInterface();
					this.updateExtentByRegion(this._region);
					this.setMapLayers();
				}
			} 

			this.hideTool = function(){
				
			}
			
			this.closeTool = function(){
				if (!_.isEmpty(this._mapLayers)) {
					array.forEach(_.keys(this._mapLayers), function(region) {
						self._mapLayers_closeState[region] = {};
						array.forEach(_.keys(self._mapLayers[region]), function(layer) {
							self._mapLayers_closeState[region][layer] = self._mapLayers[region][layer].visible;
							self._mapLayers[region][layer].hide();
						})
					})
				}
			}
			
			this.loadLayerStats = function() {
				array.forEach(_.keys(this._interface.region), function(key) {
					if (!_.has(self._interface.region[key].stats, "dist")) {
						self._interface.region[key].stats.dist = {};
						self._interface.region[key].stats.dist.habitat = {};
						self._interface.region[key].stats.dist.factors = {};
						
						var q = new Query();
						q.where = "1=1";
						q.returnGeometry = false;
						q.outFields = self._interface.region[key].query.habitat.outFields;
						
						var qt = new QueryTask(self._interface.region[key].query.habitat.url);
						qt.execute(q, function(results) {
							var habitat = self._interface.region[key].key.habitat;
							var keyField = self._interface.region[key].query.habitat.keyField;
							var valueField = self._interface.region[key].query.habitat.valueField;
							
							array.forEach(results.features, function(row) {
								self._interface.region[key].stats.dist.habitat[habitat[row.attributes[keyField]]] = row.attributes[valueField];
							});
							self._interface.region[key].stats.dist.habitat.total = _.reduce(_.values(self._interface.region[key].stats.dist.habitat), function(memo, num) { return memo + num }, 0)
							
							
							array.forEach(_.keys(self._interface.region[key].query.factors), function(factor) {
								self._interface.region[key].stats.dist.factors[factor] = {}
								
								var q = new Query();
								q.where = "1=1";
								q.returnGeometry = false;
								q.outFields = self._interface.region[key].query.factors[factor].outFields;
								
								var qt = new QueryTask(self._interface.region[key].query.factors[factor].url);
								qt.execute(q, function(results) {
									var keyField = self._interface.region[key].query.factors[factor].keyField;
									var valueField = self._interface.region[key].query.factors[factor].valueField;
									
									var total = _.reduce(_.map(results.features, function(row) { return row.attributes[valueField]; }) , function(memo, num) { return memo + num }, 0)
									array.forEach(results.features, function(row) {
										self._interface.region[key].stats.dist.factors[factor][row.attributes[keyField]] = row.attributes[valueField] / total * self._interface.region[key].stats.dist.habitat.total;
									});
								});
							});
						});
					}
				});
			}

			this.loadLayers = function() {
				on(this._map, "zoom-end", function(evt) {
					self.updateMapLayers();
				})
				
				var i = 0
				array.forEach(_.keys(self._interface.region), function(region){
					self._mapLayers[region] = {}
					array.forEach(_.keys(self._interface.region[region].layers), function(layer) {
						var id = "ls-layer-" + i;
						if (self._interface.region[region].layers[layer].type == "dynamic") {
							var mapLayer = new DynamicMapServiceLayer(self._interface.region[region].layers[layer].url, { id:id });
							mapLayer.setVisibleLayers(self._interface.region[region].layers[layer].visibleIds);
							mapLayer.setImageFormat("png32");
						} else {
							var mapLayer = new FeatureLayer(self._interface.region[region].layers[layer].url, { id:id, outFields:["*"] });
							var symbol = new esri.symbol.SimpleFillSymbol(esri.symbol.SimpleFillSymbol.STYLE_SOLID, new esri.symbol.SimpleLineSymbol(esri.symbol.SimpleLineSymbol.STYLE_SOLID, new dojo.Color([0,0,0,0]),1), new dojo.Color([255,255,255,0.05]));
							mapLayer.setRenderer(new esri.renderer.SimpleRenderer(symbol));
							
							on(mapLayer, "update-end", function(evt) {
								query("#" + id + "_layer path").style("cursor", "pointer");
							});
							
							on(mapLayer, "click", function(evt){
								self._map.graphics.clear()
								var symbol = new esri.symbol.SimpleFillSymbol(esri.symbol.SimpleFillSymbol.STYLE_SOLID, new esri.symbol.SimpleLineSymbol(esri.symbol.SimpleLineSymbol.STYLE_SOLID, new dojo.Color([0,0,0,1]),4), new dojo.Color([0,0,0,0]));
								self._map.graphics.add(new Graphic(evt.graphic.geometry, symbol))
								
								var node = _.first(query(".plugin-ls .details"));
								var params = {
									node: node,
									duration: 800,
									beforeBegin: function(){
										domStyle.set(node, "display", "block")
									}
								};
								fx.fadeIn(params).play();
								
								var attributes = evt.graphic.attributes;
								var data = {};
								data.habitat = (!_.isUndefined(self._interface.region[self._region].key)) ? self._interface.region[self._region].key.habitat[attributes[self._interface.region[self._region].table.footer.label_field]] : attributes[self._interface.region[self._region].table.footer.label_field]
								if (_.has(self._interface.region[self._region].table.footer, "score_field")){
									data.final = attributes[self._interface.region[self._region].table.footer.score_field];
								}
								data.data = array.map(self._interface.region[self._region].table.rows.tr, function(row) {
									return { "name": row.id, "value": attributes[row.field] }
								})
								
								self.updateDetailContent(data);
							})
							
							/* on(mapLayer, "mouse-over", function(evt){
								var symbol = new esri.symbol.SimpleFillSymbol(esri.symbol.SimpleFillSymbol.STYLE_SOLID, new esri.symbol.SimpleLineSymbol(esri.symbol.SimpleLineSymbol.STYLE_SOLID, new dojo.Color([0,0,0,1]),2), new dojo.Color([0,0,0,0.1]));
								self.hoverLayer.add(new Graphic(evt.graphic.geometry, symbol))
							})
							
							on(mapLayer, "mouse-out", function(evt){
								self.hoverLayer.clear();
							}) */
						}
						if (mapLayer) {
							self._mapLayers[region][layer] = mapLayer;
							self._map.addLayer(mapLayer);
							mapLayer.hide();
						}
						i += 1
					});
				});
				
				/* this.hoverLayer = new GraphicsLayer();
				this._map.addLayer(this.hoverLayer); */
				
				on(this._map, "click", function(evt){
					
					if(!_.contains(evt.target.parentElement.id.split("-"), "ls")) {
						self._map.graphics.clear();
						var node = _.first(query(".plugin-ls .details"));
						var params = {
							node: node,
							duration: 500,
							onEnd: function(){
								domStyle.set(node, "display", "none");
								domStyle.set(_.first(query(".plugin-ls .details")).parentNode, "height", "auto"); 
							}
						};
						fx.fadeOut(params).play();
					}
				})
			}
			
			this.createDetailContent = function() {
				var table = this.detailTable;
				domConstruct.empty(table);
				
				//create table header
				var header = this._interface.region[this._region].table.header;
				var tr = domConstruct.create("tr", { class:"table-header" }, table);
				array.forEach(header.td, function(td) {
					domConstruct.create("td", {
						class:"table-header-cell",
						innerHTML: td.name,
						style:"width:" + td.width
					}, tr);
				});

				//create table rows
				var rows = this._interface.region[this._region].table.rows;
				array.forEach(rows.tr, function(row) {
					var tr = domConstruct.create("tr", { class:row.id }, table);
					array.forEach(header.td, function(td) {
						var label = (td.css == "label") ? row.label : "";
						domConstruct.create("td", { class:td.css, innerHTML:label }, tr);
					})
				});
				
				//create table "footer"
				var colspan = this._interface.region[this._region].table.footer.colspan
				var tr = domConstruct.create("tr", { class:"final-rec" }, table);
				domConstruct.create("td", {class:"category", colspan: colspan}, tr);
				if (_.has(this._interface.region[this._region].table.footer, "score_field")){
					domConstruct.create("td", {class:"final-score"}, tr);
				}
			}
			
			this.updateDetailContent = function(data) {
				var colors = this._interface.region[this._region].colors;
				var labels = this._interface.region[this._region].labels;
						
				query(".plugin-ls .details .content tr.final-rec").style("color", colors.habitat[data.habitat]);
				_.first(query(".plugin-ls .details .content td.category")).innerHTML = labels.habitat[data.habitat].replace("<br>"," ");
				if (_.has(this._interface.region[this._region].table.footer, "score_field")){
					_.first(query(".plugin-ls .details .content td.final-score")).innerHTML = data.final;
				}
				
				array.forEach(data.data, function(d) {
					if (query(".plugin-ls .details .content tr." + d.name + " td.value").length > 0) {
						_.first(query(".plugin-ls .details .content tr." + d.name + " td.value")).innerHTML = labels.scores[d.value][d.name];
					}
					_.first(query(".plugin-ls .details .content tr." + d.name + " td.score")).innerHTML = d.value;
				})
				
				var height = (this._interface.region[this._region].table.parent_height) ? this._interface.region[this._region].table.parent_height : "auto";
				domStyle.set(_.first(query(".plugin-ls .details")).parentNode, "height", height); 
				
			}
			
			this.updateMapLayers = function() {
				var scale = (this._map.getScale() > this.featureLayerScale) ? "small" : "large";
				var visibleIds = (this.recommendationPane.open) ? this._interface.region[this._region].layers.main.scaleRangeIds[scale] : (_.has(self._data.region[self._region], "county")) ? self._data.region[self._region]["county"] : [];
				
				if (this._interface.region[this._region].interface.factors.controls.show.radio.length > 0) {
					array.forEach(_.keys(this._interface.controls.factors.radio), function(rb) {
						if (self[rb + "RadioButton"].checked && !self.recommendationPane.open) {
							visibleIds = _.union(visibleIds, self._data.region[self._region][rb]);
						}
					});
				}
				
				if (this._interface.region[this._region].interface.factors.controls.show.togglebutton.length > 0) {
					array.forEach(this._interface.region[this._region].interface.factors.controls.show.togglebutton, function(tb) {
						if (!self.recommendationPane.open) {
							var value = _.first(query("input[name='" + tb + "']:checked")).value;
							visibleIds = _.union(visibleIds, self._data.region[self._region][value]);
							
							var control = self._interface.controls.factors.togglebutton[tb].controls[value];
							if (_.has(control,"dependency")) {
								array.forEach(_.keys(control.dependency.show), function(d) {
									if (d == "select") {
										array.forEach(control.dependency.show[d], function(c) {
											visibleIds = _.union(visibleIds, self._data.region[self._region][self[c + "Select"].value]);
										})
									}
								})
								array.forEach(_.keys(control.dependency.enable), function(d) {
									if (d == "select") {
										array.forEach(control.dependency.enable[d], function(c) {
											visibleIds = _.union(visibleIds, self._data.region[self._region][self[c + "Select"].value]);
										})
									}
								})
							}
						}
					});
				}
				
				if (this._interface.region[this._region].interface.other.controls.show.check.length > 0) {
					array.forEach(_.keys(this._interface.controls.check), function(cb) {
						if (self[cb + "CheckBox"].checked) {
							visibleIds = _.union(visibleIds, self._data.region[self._region][cb]);
						}
					});
				}
				
				this._mapLayer.setVisibleLayers(visibleIds);
			}
			
			this.setMapLayers = function() {
				array.forEach(_.keys(this._mapLayers), function(key) {
					if (key == self._region) {
						self._mapLayers[key].main.setVisibleLayers(self._interface.region[key].layers.main.visibleIds);
						self._mapLayers[key].main.show();
						self._mapLayers[key].feature.show();
						
						self._mapLayer = self._mapLayers[key].main;
						self._featureLayer = self._mapLayers[key].feature;
					} else {
						self._mapLayers[key].main.hide();
						self._mapLayers[key].feature.hide();
					}
				});
			}
			
			this.setDefinitionExpression = function(pane, value, type) {
				var layerDefs = (!_.isUndefined(this._mapLayer.layerDefinition)) ? this._mapLayer.layerDefinition : [];
				value = (_.isNaN(parseInt(value))) ? "'" + value + "'" : value;
				switch(pane) {
					case "habitat":
						var def = this._interface.region[this._region].definitionExpression.habitat.field + " = " + value;
						var index = this._interface.region[this._region].definitionExpression.habitat.dynamicId;
						this._featureLayer.setDefinitionExpression(def);
						break;
						
					case "factor":
						var def = this._interface.region[this._region].definitionExpression.factor[type].field + " = " + value;
						var index = this._interface.region[this._region].definitionExpression.factor[type].dynamicId;
						break;
				}
				layerDefs[index] = def;
				this._mapLayer.setLayerDefinitions(layerDefs)
			}
			
			this.clearDefinitionExpression = function(pane, type) {
				var layerDefs = (!_.isUndefined(this._mapLayer.layerDefinition)) ? this._mapLayer.layerDefinition : [];
				switch(pane) {
					case "habitat":
						var index = this._interface.region[this._region].definitionExpression.habitat.dynamicId;
						this._featureLayer.setDefinitionExpression("");
						break;
						
					case "factor":
						var index = this._interface.region[this._region].definitionExpression.factor[type].dynamicId;
						break;
				}
				layerDefs[index] = null;
				this._mapLayer.setLayerDefinitions(layerDefs); 
			}
			
			this.updateExtentByRegion = function(region) {
				this._map.setExtent(new Extent(this._interface.region[region].extent), true)
			}
						
			this.loadInterface = function() {
				var self = this;
				domStyle.set(this._container, { 
					"overflow": "visible"
				});
				
				//empty layout containers
			    this._containerPane = new ContentPane({
					id: "plugin-ls-" + self._map.id,
					style: "position:relative; overflow: visible; width:100%; height:100%;",
					className: 'cr-dojo-dijits'
			    });
			    this._containerPane.startup();
				this._container.appendChild(this._containerPane.domNode);
				
				this.createInputs();
				//this.createDetailChart();
				
				this.tip = domConstruct.create("div", { className: "plugin-ls help", tabindex: -1 });
				domConstruct.create("div", {
					class: "header",
					innerHTML: "Documentation"
				},  this.tip);
				
				var closeDiv = domConstruct.create("div", {
					class: "icon-cancel close"
				},  this.tip);
				
				on(closeDiv, "click", function(evt) {
					var node = this.parentNode;
					var params = {
						node: node,
						duration: 500,
						onEnd: function(){
							domStyle.set(node, "display", "none");
						}
					};
					fx.fadeOut(params).play();
				})
				domConstruct.create("div", {
					class: "inner",
				},  this.tip);
				
				
				this._container.appendChild(this.tip);
				
				this.createTooltips();
				domStyle.set(_.first(query(".plugin-ls .fa-spinner")).parentNode, "display", "none");
			}
			
			this.createInputs = function(){
				this.inputsPane = new ContentPane({});
				this._containerPane.domNode.appendChild(this.inputsPane.domNode);
			    domStyle.set(this.inputsPane.containerNode, {
					"position": "relative",
					"overflow": "visible",
					"background": "none",
					"border": "none",
					"width": "100%",
					"height": "auto",
					"padding": "20px 0px 0px 20px"
				});
				on(this._map, "resize", function() {
					domStyle.set(self.inputsPane.containerNode, { "width": "100%", "height": "auto" });
				});
				
				domConstruct.create("div", { 
					class:"plugin-desc"
				}, this.inputsPane.containerNode);
				
				var display = (_.keys(this._interface.region).length > 1) ? "block" : "none";
				
				var table = domConstruct.create("table", {
					style:"position:relative;width: 100%;background: none;border: none; margin:0px 0px 0px 0px;display:" + display
				}, this.inputsPane.containerNode);
				var tr = domConstruct.create("tr", {}, table);
				var regionTd = domConstruct.create("td", { "colspan":3, "style": "padding-bottom:10px;" }, tr);
				
				var regionText = domConstruct.create("div", {
					style:"position:relative;margin-bottom:5px;text-align:left;font-size:14px;",
					innerHTML: "<i class='fa fa-question-circle ls-" + this._map.id + "-region'></i>&nbsp;<b>Select a County:</b>"
				}, regionTd);
				
				var regionSelectDiv = domConstruct.create("div", { 
					className: "styled-select",
					style:"width:175px;display:inline-block;" 
				}, regionTd);
				this.regionSelect = dojo.create("select", { name: "regionType"}, regionSelectDiv);
				array.forEach(_.keys(this._interface.region), function(key) {
					domConstruct.create("option", { innerHTML: key, value: key }, self.regionSelect);
				});
				on(this.regionSelect, "change", function() {
					self._region = this.value;
					self.updateInterface();
					self.updateExtentByRegion(self._region);
					self.setMapLayers();
				});
				this.regionSelect.value = _.first(this.regionSelect.options).value;
				this._region = this.regionSelect.value;
				
				this.downloadReport = domConstruct.create("div", { className:"downloadButton ls-report", innerHTML:'<i class="fa fa-file-pdf-o downloadIcon"></i><span class="downloadText">County Summary</span>' }, regionTd);
				on(this.downloadReport,"mouseover", function(){
					if (self._region && self._region != "") {
						domStyle.set(this, "background", "#0096d6");
					}
				});
				on(this.downloadReport,"mouseout", function(){
					if (self._region && self._region != "") {
						 domStyle.set(this, "background", "#2B2E3B");
					}
				});
				on(this.downloadReport,"click", function(){
					 if (self._region && self._region != "") {
						var url = self._interface.region[self._region].download.report;
						url = url.replace("HOSTNAME-", window.location.href);
						window.open(url, "_blank");
					 }
				});
				
				this.layersPane = new ContentPane({ class: "layers"});
				this._containerPane.domNode.appendChild(this.layersPane.domNode);
				domStyle.set(this.layersPane.containerNode, {
					"position": "relative",
					"border": "none",
					"width": "100%",
					"height": "auto",
					"padding": "0px",
					"margin-top":"5px"
				});
				
				this.mainStat = domConstruct.create("div", { class: "main-stat", innerHTML: "<span class='main-stat-value'></span>% of Shoreline Suitable for Living Shoreline" }, this.layersPane.containerNode);
				
				this.titleGroupPane = new TitleGroup({style:"height:auto;"});
				
				this.recommendationPane = new TitlePane({
					title: "<i class='fa tg-toggle-icon'></i>&nbsp;Living Shoreline Suitability Types",
					style:"width:100%;",
					open:true
				});
				aspect.after(this.recommendationPane, "toggle", function(){
					if (this.open) {
						domClass.remove(this.titleNode.firstChild, "fa-plus");
						//domClass.add(this.titleNode.firstChild, "fa-minus");
						self._featureLayer.show();
					} else {
						//domClass.remove(this.titleNode.firstChild, "fa-minus");
						domClass.add(this.titleNode.firstChild, "fa-plus");
						self._featureLayer.hide();
					}
					self.updateMapLayers();
				})
				
				dojo.mixin(this.recommendationPane, {
					_onTitleClick: function(){
						var widget = this;
						if (!widget.open) {
							query(".layers .dijitTitlePane").forEach(function (b) {
								var b = dijit.getEnclosingWidget(b);
								if (b.open || b.id == widget.id) {
									b.toggle();
								}
							})
						}
					}
				});
				this.titleGroupPane.addChild(this.recommendationPane)
				
				this.statsControlPane = new ContentPane({ class: "stats recommendations"});
				this.recommendationPane.containerNode.appendChild(this.statsControlPane.domNode);
				domStyle.set(this.statsControlPane.containerNode, {
					"position": "relative",
					"border": "none",
					"width": "100%",
					"height": "auto",
					"padding-top": "10px"
				});
				
				array.forEach(_.keys(this._interface.controls.recommendation.pills), function(habitat, i) {
					var statDiv = domConstruct.create("div", {
						class: "stat",
						style:"margin-bottom:10px;margin-top:" + ((i == 0) ? 0 : 10)  + "px;"
					}, self.statsControlPane.containerNode);
					
					var stat = domConstruct.create("div", { 
						class: "stat-pill " + habitat
					}, statDiv);
					domAttr.set(stat, "data-expression-value", self._interface.controls.recommendation.pills[habitat].value);
					
					var number = domConstruct.create("div", { class: "stat-number" }, stat);
					domConstruct.create("div", { class: "stat-pct", innerHTML: 0 }, number);
					domConstruct.create("div", { class: "stat-units", innerHTML: "%"}, number);
					domConstruct.create("div", { class: "stat-dist", innerHTML: "(<span class='stat-value'></span> mi)" }, number);
					domConstruct.create("div", { class: "stat-label", innerHTML: self._interface.controls.recommendation.pills[habitat].label }, stat);
					domConstruct.create("div", { class: "stat-info", innerHTML:"<i class='fa fa-question-circle ls-" + self._map.id + "-stat-" + habitat + "'></i>"}, statDiv);
					var statClose = domConstruct.create("div", { class: "stat-close icon-cancel close"}, statDiv);
					
					on(statClose, "click", function(evt){
						query(".plugin-ls .recommendations .stat-pill").removeClass("inactive");
						query(".stat-close", this.parentNode).style("display", "none");
						
						var node = _.first(query(".stat-pill", this.parentNode));
						var value = domAttr.get(node, "data-expression-value");
						self.clearDefinitionExpression("habitat");
					})
					
					on(stat, "mouseover", function(){
						domClass.add(this, "stat-over");
					})
					on(stat, "mouseout", function(){
						domClass.remove(this, "stat-over");
					})
					on(stat, "click", function(){
						query(".plugin-ls .recommendations .stat-pill").addClass("inactive");
						domClass.remove(this, "inactive");
						query(".recommendations .stat-close").style("display", "none");
						query(".stat-close", this.parentNode).style("display", "block");
						
						var value = domAttr.get(this, "data-expression-value");
						self.setDefinitionExpression("habitat", value);
					})
					
				});
				
				var zoomDiv = domConstruct.create("div", { 
					style:"line-height:14px;text-align:left;cursor:pointer;margin:15px 0px 10px 0px;font-size:12px;padding-left:30px;color:#777777;",
					innerHTML: '-- zoom in to map to select a shoreline segment for more details --'
				},  self.statsControlPane.containerNode);
				on(zoomDiv,"click",function(){
					self._map.setScale(self.featureLayerScale);
				});
				
				var detailDiv = domConstruct.create("div", {
					class: "details"
				},  self.statsControlPane.containerNode);
				
				domConstruct.create("div", {
					class: "header",
					innerHTML: "Details of Living Shoreline Suitability"
				},  detailDiv);
				
				var closeDiv = domConstruct.create("div", {
					class: "icon-cancel close"
				},  detailDiv);
				
				on(closeDiv, "click", function(evt) {
					var node = this.parentNode;
					var params = {
						node: node,
						duration: 500,
						onBegin: function() {
							self._map.graphics.clear();
						},
						onEnd: function(){
							domStyle.set(node, "display", "none");
							domStyle.set(_.first(query(".plugin-ls .details")).parentNode, "height", "auto"); 
						}
					};
					fx.fadeOut(params).play();
				})
				
				var detailInner = domConstruct.create("div", {
					class: "inner",
				},  detailDiv);
				
				domConstruct.create("div", {
					class: "chart"
				},  detailInner);
				
				var content = domConstruct.create("div", {
					class: "content"
				},  detailInner);
				
				this.detailTable = domConstruct.create("table", {}, content);
				
				this.factorPane = new TitlePane({
					title: "<i class='fa fa-plus tg-toggle-icon'></i>&nbsp;Living Shoreline Suitability Factors",
					style:"width:100%;",
					open:false
				});
				domStyle.set(this.factorPane.containerNode, { "padding-top": "10px", "padding-bottom":"20px" })
				
				aspect.after(this.factorPane, "toggle", function(){
					if (this.open) {
						domClass.remove(this.titleNode.firstChild, "fa-plus");
						//domClass.add(this.titleNode.firstChild, "fa-minus");
						self.updateFactors();
					} else {
						//domClass.remove(this.titleNode.firstChild, "fa-minus");
						domClass.add(this.titleNode.firstChild, "fa-plus");
					}
					self.updateMapLayers();
				})
				
				dojo.mixin(this.factorPane, {
					_onTitleClick: function(){
						var widget = this;
						if (!widget.open) {
							query(".layers .dijitTitlePane").forEach(function (b) {
								var b = dijit.getEnclosingWidget(b);
								if (b.open || b.id == widget.id) {
									b.toggle();
								}
							})
						}
					}
				});
				this.titleGroupPane.addChild(this.factorPane);
				
				this.factorControlPane = new ContentPane({ class: "stats factors"});
				this.factorPane.containerNode.appendChild(this.factorControlPane.domNode);
				domStyle.set(this.factorControlPane.containerNode, {
					"position": "relative",
					"border": "none",
					"width": "100%",
					"height": "auto",
					"padding-top":"0px"
				});
				
				if (!_.isUndefined(self._interface.controls.factors.pills)) {
					array.forEach(_.keys(this._interface.controls.factors.pills).reverse(), function(factor, i) {
						var factorsDiv = domConstruct.create("div", { 
							class: "stat",
							style:"margin-bottom:10px;margin-top:" + ((i == 0) ? 0 : 10)  + "px;"
						}, self.factorControlPane.containerNode);
						
						var stat = domConstruct.create("div", {
							class: "stat-pill factor" 
						}, factorsDiv);
						domAttr.set(stat, "data-expression-value", factor);
						
						var number = domConstruct.create("div", { class: "stat-number" }, stat);
						domConstruct.create("div", { class: "stat-pct", innerHTML: 0 }, number);
						domConstruct.create("div", { class: "stat-units", innerHTML: "%"}, number);
						domConstruct.create("div", { class: "stat-dist", innerHTML: "(<span class='stat-value'></span> mi)" }, number);
						domConstruct.create("div", { class: "stat-label " + factor, innerHTML:"" }, stat);
						domConstruct.create("div", { class: "stat-score", innerHTML: factor }, stat);
						domConstruct.create("div", { class: "stat-info", innerHTML:"<i class='fa fa-question-circle ls-" + self._map.id + "-stat-factor_" + factor + "'></i>"}, factorsDiv);
						
						var factorClose = domConstruct.create("div", { class: "stat-close icon-cancel close"}, factorsDiv);
						on(factorClose, "click", function(evt){
							query(".plugin-ls .factors .stat-pill").removeClass("inactive");
							query(".stat-close", this.parentNode).style("display", "none");
							
							var type = _.first(dojo.query(".plugin-ls .styled-radio input:checked")).value;
							self.clearDefinitionExpression("factor", type);
						})
						
						on(stat, "mouseover", function(){
							domClass.add(this, "stat-over");
						})
						on(stat, "mouseout", function(){
							domClass.remove(this, "stat-over");
						})
						on(stat, "click", function(){
							query(".plugin-ls .factors .stat-pill").addClass("inactive");
							domClass.remove(this, "inactive");
							query(".factors .stat-close").style("display", "none");
							query(".stat-close", this.parentNode).style("display", "block");
							
							var value = domAttr.get(this, "data-expression-value");
							var type = _.first(dojo.query(".plugin-ls .styled-radio input:checked")).value;
							self.setDefinitionExpression("factor", value, type);
						})
					});
				}
				
				var cp = new ContentPane({}, this.factorPane.containerNode);
				
				this.toggleContainerDiv = domConstruct.create("div", {
					class:"togglebutton-container-div"
				}, cp.containerNode);
				
				if (!_.isUndefined(self._interface.controls.factors.togglebutton)) {
					array.forEach(_.keys(self._interface.controls.factors.togglebutton), function(g) {
						var show = (self._interface.controls.factors.togglebutton[g].show) ? "block" : "none"; 
						var toggleDiv = domConstruct.create("div", {
							className: "togglebutton-div " + g,
							style: "margin-top: 5px;display:" + show
						}, self.toggleContainerDiv);
						
						if (self._interface.controls.factors.togglebutton[g].label) {
							domConstruct.create("div", {
								innerHTML: '<i class="fa fa-question-circle ls-' + self._map.id + '-togglegroup_' + g + '"></i>&nbsp;<b>' + self._interface.controls.factors.togglebutton[g].label + '</b>'
								}, toggleDiv);
						}
						
						var containerDiv = domConstruct.create("div", {
							className: "toggle-btn " + g
						}, toggleDiv);
						
						var rbs = _.values(self._interface.controls.factors.togglebutton[g].controls)
						array.forEach(rbs, function(rb) {
							self[rb.name + "ToggleButton"] = domConstruct.create("input", { 
								type: "radio", 
								value: rb.value, 
								name: rb.group, 
								id: "plugin-ls-togglebutton-" + rb.group + "-" + rb.name + "-" + self._map.id
							}, containerDiv);
							
							if (rb.checked) { self[rb.name + "ToggleButton"].checked = true }
							
							domConstruct.create("label", { 
								for: "plugin-ls-togglebutton-" + rb.group + "-" + rb.name + "-" + self._map.id,
								innerHTML: rb.label
							}, containerDiv);
							
							on(self[rb.name + "ToggleButton"] , "change", function() {
								if (this.checked) {
									self.setControlDependency("factors","togglebutton", this.value, this.name);
								}
								if (this.checked && self._region != "") {
									self.updateMapLayers();
								}
							});
						}); 
					});
				}
				
				if (!_.isUndefined(self._interface.controls.factors.select)) {
					var selectContainerDiv = domConstruct.create("div", {
						className: "select-container-div"
					}, cp.containerNode);
					
					array.forEach(_.keys(this._interface.controls.factors.select), function(i) {						
						var s = self._interface.controls.factors.select[i];	
						var show = (s.show) ? "block" : "none";					
						var color = (s.disabled) ? "#d3d3d3" : "#333333";
						
						var selectContainer = domConstruct.create("div", {
							style: "display:" + show + ";color:" + color,
							className:"select-div " + i
						}, selectContainerDiv);
						
						var text = domConstruct.create("div", {
							style: "position:relative;margin-bottom:5px;",
							innerHTML: '<b>' + s.label + '</b>'
						}, selectContainer);
						
						var selectDiv = domConstruct.create("div", {
							className: "styled-select",
							style:"width:100%;display:block;margin-bottom:5px;"
						}, selectContainer);
						
						self[i + "Select"] = domConstruct.create("select", {
							name: i,
							disabled: s.disabled
						}, selectDiv);
						
						array.forEach(s.options, function(item) {
							domConstruct.create("option", { innerHTML: item.name, value: item.value },self[i + "Select"]);
						});

						on(self[i + "Select"], "change", function() { 
							self.updateMapLayers();
						});
					})
					
				}
				
				if (!_.isUndefined(self._interface.controls.factors.radio)) {
					var rbDiv = domConstruct.create("div", { style:"height:auto"}, cp.containerNode);
					array.forEach(_.keys(this._interface.controls.factors.radio), function(rb) {
						var rb = self._interface.controls.factors.radio[rb];
						
						var div = domConstruct.create("div",{
							style:"position:relative;margin-bottom:5px;",
							class:"radio-div " + rb.name
						}, rbDiv);
						
						var radioButtonLabel = domConstruct.create("label", { 
							className:"styled-radio",
							style:"margin:0px 0px 0px 25px;", 
							for: "plugin-ls-" + rb.name + "-" + self._map.id
							}, div);
						
						self[rb.name + "RadioButton"] = domConstruct.create("input", { 
							type: "radio", 
							value: rb.value, 
							name: rb.group, 
							id: "plugin-ls-" + rb.name + "-" + self._map.id
						}, radioButtonLabel);
						
						if (rb.checked) { self[rb.name + "RadioButton"].checked = true }
						
						domConstruct.create("span", {
							innerHTML:rb.label 
						}, radioButtonLabel );
						
						on(self[rb.name + "RadioButton"] , "change", function() {
							self.updateFactors();
							
							array.forEach(_.keys(self._interface.region[self._region].query.factors), function(key) {
								window.setTimeout(function(){ 
									self.clearDefinitionExpression("factor", key);
								}, 500)
							});
							query(".plugin-ls .factors .stat-pill").removeClass("inactive");
							query(".plugin-ls .factors .stat-close").style("display", "none");
							
							self.updateMapLayers();
							
						});
						
						domConstruct.create("div", {
							style:"position:absolute;top:4px;left:380px;",
							innerHTML: "<i class='fa fa-question-circle ls-" + self._map.id + "-" + rb.name + "'></i>"
						}, div);
					})
				}
				
				this.layersPane.addChild(this.titleGroupPane);
				this.titleGroupPane.startup();

				var cp = new ContentPane({
					style:"width:100%;margin-top:10px;position: relative;min-height:28px"
				});
				this._containerPane.domNode.appendChild(cp.domNode);
				
				if (!_.isUndefined(self._interface.controls.other.check)) {
					var other = domConstruct.create("div", { class:"other"}, cp.containerNode);
					domConstruct.create("div", { class:"add-layers-header", innerHTML: "Additional Layers" }, other);
					domConstruct.create("div", { class:"add-layers-instructions", innerHTML: "Learn more about data used as part of these recommendations by selecting from the additional layers below:" }, other);
					
					var checkBoxDiv = domConstruct.create("div", {}, other);
					array.forEach(_.keys(this._interface.controls.other.check), function(cb) {
						var cb = self._interface.controls.other.check[cb];
						var checkBoxLabel = domConstruct.create("label", { 
							for: "plugin-ls-" + cb.name + "-" + self._map.id,
							className:"styled-checkbox",
							style:"display:block;margin-left:20px;"
						}, checkBoxDiv);
						
						self[cb.name + "CheckBox"] = domConstruct.create("input", {
							type:"checkbox",
							value:cb.value,
							name:cb.name,
							id:"plugin-ls-" + cb.name + "-" + self._map.id,
							disabled:false,
							checked:false
						}, checkBoxLabel);
						
						domConstruct.create("div", {
							innerHTML: '<span>' + cb.label +'</span>'
						}, checkBoxLabel);
						
						on(self[cb.name + "CheckBox"], "change", function(){
							self.updateMapLayers();
						});
					});
				}
				
				var opacity = domConstruct.create("div", {
					className: "utility-control",
					innerHTML: '<span class="slr-' + this._map.id + '-opacity"><b>Opacity</b>&nbsp;<i class="fa fa-adjust"></i></span>'
				}, cp.containerNode);
				
				on(opacity,"click", function() {
					var status = domStyle.get(self.opacityContainer, "display");
					var display = (status == "none") ? "block" : "none";
					domStyle.set(self.opacityContainer, "display", display);
				})
				
				this.opacityContainer = domConstruct.create("div", {
					className: "utility"
				}, cp.containerNode);
				
				//opacity slider
				this.opacitySlider = new HorizontalSlider({
			        name: "opacitySlider",
			        value: 1,
			        minimum: 0,
			        maximum: 1,
			        intermediateChanges: true,
			        showButtons: false,
					disabled: false,
			        style: "width:75px; display:inline-block; margin:0px; background:none;",
			        onChange: function(value){
						array.forEach(_.keys(self._mapLayers), function(region){
							array.forEach(_.keys(self._mapLayers[region]), function(layer){
								self._mapLayers[region][layer].setOpacity(Math.abs(value));
							})
						})
			        }
			    });
				this.opacityContainer.appendChild(this.opacitySlider.domNode);
				
			}
			
			this.updateFactors = function() {
				if (self._interface.region[self._region].interface.factors.display) {
					var value = _.first(dojo.query(".plugin-ls .styled-radio input:checked")).value;
					var nodes = query('.plugin-ls .stat-pill.factor .stat-label');
					
					array.forEach(nodes, function(node) {
						var score = domAttr.get(node.parentNode, "data-expression-value");
						if (!_.isUndefined(self._interface.controls.factors.pills[score].label[value])) { 
							var num = self._interface.region[self._region].stats.dist.factors[value][score];
							var pct = self._interface.region[self._region].stats.pct.factors[value][score];
							
							query('div.stat-pill.factor[data-expression-value=' + score + ']').style("background-color", self._interface.region[self._region].colors.scores[score]);
							_.first(query("div.stat-pill.factor[data-expression-value=" + score + "] .stat-pct")).innerHTML = pct;
							_.first(query("div.stat-pill.factor[data-expression-value=" + score + "] .stat-value")).innerHTML = (num < 10) ? d3.format(".2f")(num) : d3.format(",.0f")(num);
							
							node.innerHTML = self._interface.controls.factors.pills[score].label[value];
							domStyle.set(node.parentNode.parentNode, "display", "block");
						} else {
							domStyle.set(node.parentNode.parentNode, "display", "none");
						}
					})
				}
			}
			
			this.updateInterface = function(){
				var ui = this._interface.region[this._region].interface;
				
				if (ui.description.show) {
					_.first(query(".plugin-ls .plugin-desc")).innerHTML = ui.description.label;
					query(".plugin-ls .plugin-desc").style("display", "block");
				} else {
					query(".plugin-ls .plugin-desc").style("display", "none");
				}
				
				array.forEach(_.keys(this._interface.controls.recommendation.pills), function(habitat) {
					var label = self._interface.region[self._region].labels.habitat[habitat];
					var color = self._interface.region[self._region].colors.habitat[habitat];
					_.first(query(".stat-pill." + habitat + " .stat-label")).innerHTML = label;
					query(".stat-pill." + habitat).style("background-color", color);
					
					var num = self._interface.region[self._region].stats.dist.habitat[habitat];
					var pct = self._interface.region[self._region].stats.pct.habitat[habitat];
					_.first(query(".stat-pill." + habitat + " .stat-pct")).innerHTML = pct;
					_.first(query(".stat-pill." + habitat + " .stat-value")).innerHTML = (num < 10) ? d3.format(".2f")(num) : d3.format(",.0f")(num);
					
					var value = self._interface.region[self._region].definitionExpression.habitat.values[habitat];
					domAttr.set(_.first(query(".stat-pill." + habitat)), "data-expression-value", value);
				});
				_.first(query(".plugin-ls .main-stat-value")).innerHTML = self._interface.region[self._region].stats.pct.habitat.total;
				
				if (!this.recommendationPane.open) {
					this.recommendationPane.toggle();
					this.factorPane.toggle();
				}
				
				var display = (ui.factors.display) ? "block" : "none";
				query(".stats.factors").style("display", display);
				
				array.forEach(_.keys(ui.factors.controls.hide), function(type) {
					array.forEach(ui.factors.controls.hide[type], function(control) {
						query("." + type + "-div." + control).style("display","none")
					})
				})
				
				array.forEach(_.keys(ui.factors.controls.show), function(type) {
					array.forEach(ui.factors.controls.show[type], function(control) {
						query("." + type + "-div." + control).style("display","block")
					})
					if (type == "radio" && ui.factors.controls.show[type].length > 0) {
						self[_.first(ui.factors.controls.show[type]) + "RadioButton"].checked = true;
					}
					if (type == "togglebutton" && ui.factors.controls.show[type].length > 0) {
						array.forEach(ui.factors.controls.show[type], function(control) {
							var tb = self[_.first(_.keys(self._interface.controls.factors.togglebutton[control].controls)) + "ToggleButton"];
							tb.checked = true;
							self.setControlDependency("factors","togglebutton", tb.value, tb.name);
						});
					}
				})
				
				var display = (ui.other.display) ? "block" : "none";
				query(".plugin-ls .other").style("display", display);
				
				if (!_.isUndefined(this._interface.controls.other.check)) {
					array.forEach(_.keys(this._interface.controls.other.check), function(key) {
						self[key + "CheckBox"].checked = false;
					})
				}
				
				if (!_.isUndefined(this._featureLayer) && !_.isEmpty(this._featureLayer)) {
					this.clearDefinitionExpression("habitat");
					if (_.has(self._interface.region[self._region].definitionExpression, "factors")) {
						array.forEach(_.keys(this._interface.region[this._region].query.factors), function(key) {
							window.setTimeout(function(){ 
								self.clearDefinitionExpression("factor", key);
							}, 500)
						});
					}
				}
				
				query(".plugin-ls .stat-pill").removeClass("inactive");
				query(".plugin-ls .stat-close").style("display", "none");
				
				this.opacitySlider.set("value",  1);
				domStyle.set(this.opacityContainer, "display", "none");
				
				var node = _.first(query(".plugin-ls .details"));
				if (domStyle.get(node, "display") == "block") {
					var params = {
						node: node,
						duration: 500,
						onBegin: function() {
							self._map.graphics.clear();
						},
						onEnd: function(){
							domStyle.set(node, "display", "none");
						}
					};
					fx.fadeOut(params).play();
				}
				this.createDetailContent();
			}
			
			this.setControlDependency = function(pane, category, name, group = null) {
				if (_.isNull(group)) {
					var el = this._interface.controls[pane][category][name];
				} else {
					var el = this._interface.controls[pane][category][group].controls[name];
				}
				if (_.has(el, "dependency")) {
					var d = el.dependency;
					array.forEach(_.keys(d.hide), function(type) {
						array.forEach(d.hide[type], function(control) {
							query("." + type + "-div." + control).style("display","none")
						});
					});
					array.forEach(_.keys(d.show), function(type) {
						array.forEach(d.show[type], function(control) {
							query("." + type + "-div." + control).style("display","block")
						});
					});
					
					array.forEach(_.keys(d.disable), function(type) {
						array.forEach(d.disable[type], function(control) {
							domAttr.set(self[control + "Select"], "disabled", true);
							query("." + type + "-div." + control).style("color","#d3d3d3")
							query("." + type + "-div." + control + " i").style("color", "#d3d3d3");
						});
					});
					array.forEach(_.keys(d.enable), function(type) {
						array.forEach(d.enable[type], function(control) {
							domAttr.set(self[control + "Select"], "disabled", false);
							query("." + type + "-div." + control).style("color", "#333333");
							query("." + type + "-div." + control + " i").style("color", "#333333");
						});
					});
					
				}
			}
			
			this.updateControls = function() {
				
			}
			
			this.resetInterface = function(){
				
			}

			this.createTooltips = function() {
				on(query('*.fa[class*="ls-' + this._map.id + '"]'), "click", function(evt) {
					var tooltips = (self._interface.region[self._region] && _.has(self._interface.region[self._region], "tooltips")) ? self._interface.region[self._region].tooltips : self._interface.tooltips;
					var cssClass = _.last(domAttr.get(this, "class").split(" "));
					var control = _.last(cssClass.split("-"));
					var s = control.split("_");
					if (_.first(s) == "factor") {
						var control = _.first(dojo.query(".plugin-ls .styled-radio input:checked")).value + "_" + _.last(s);
					}
					var title = tooltips[control].title;
					var message = tooltips[control].text;
					if (!_.isUndefined(message)) {
						self.showMessageDialog(this, title, message);
					}
				});
			}

			this.showMessageDialog = function(node, title, message, position) {
				_.first(query(".header", this.tip)).innerHTML = title;
				_.first(query(".inner", this.tip)).innerHTML = message;
				var top = domGeom.getMarginBox(this.layersPane.domNode).t;
				var height = domGeom.position(this._plugin.container).h - top - 5;
				domStyle.set(self.tip, {
					"top": top + "px",
					"height": height + "px"
				});
				var node = _.first(query(".plugin-ls .help"));
				var params = {
					node: node,
					duration: 800,
					beforeBegin: function(){
						domStyle.set(node, "display", "block")
					}
				};
				fx.fadeIn(params).play();
            }

            this.hideMessageDialog = function() {
        		var node = _.first(query(".plugin-ls .help"));
				var params = {
					node: node,
					duration: 800,
					onEnd: function(){
						domStyle.set(node, "display", "none")
					}
				};
				fx.fadeOut(params).play();
			}


		};
		
		return tool;	
		
	}

);
