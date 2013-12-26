/*
 * amigomap for jQuery
 * http://rvault.me/
 *
 * Copyright (c) 2013 Anton Rifco
 * Dual licensed under the MIT and GPL licenses.
 *
 * Date: December 22, 2012
 * Version: 0.1.2
 */

(function($) {
    var config, map;
    var polyDisplay = [], directionsDisplay = [], cachedroute = [], directionsService = null;
    var markers = [];
    var markers_listeners = [];
    var venueInfobox;
    $.fn.amigomap = function(options) {
        // Establish our default settings
        
        config = $.extend({
            mapOptions: {
                center: new google.maps.LatLng(1.3000, 103.8000),
                zoom: 12
            },
            layer: {
                traffic: false,
                weather: false,
                transport: false,
                bike: false,
                panoramio: false
            },
            icon: {
                hotel: "http://chart.googleapis.com/chart?chst=d_map_pin_icon&chld=flag|446288",
                inactive: "https://chart.googleapis.com/chart?chst=d_simple_text_icon_left&chld=|14|000|flag|16|000|FFF"
            },
            colorset: [
                '#426289', /* route color for day 1 */
                '#858165', /* route color for day 2 */
                '#70ADC4', /* route color for day 3 */
                '#ea8a00', /* route color for day 4 */
                '#F7998B', /* route color for day 5 */
                '#38311F', /* route color for day 6 */
                '#FF034E', /* route color for day 7 */
                '#017854', /* route color for day 8 */
                '#C6CFCC', /* route color for day 9 */
                '#2294F2'  /* route color for day 10 */
            ],
            directionService: true,
            agenda: sample_agenda,
            onsetmarker: null,
            oncomplete: null
        }, options);

        if(!google || !google.maps) {
            throw 'Google Maps API is not loaded.';
        }
        
        if(!config.mapOptions){
            throw 'Google Maps API needs non-null mapOptions parameters';
        }
        
        if(!config.mapOptions.center || !config.mapOptions.zoom ) {
            throw 'Google Maps API needs required "center" and "zoom" parameters';
        }

        var mapid = this.get(0);
        function initialize() {
            map = new google.maps.Map($(mapid).get(0), config.mapOptions);
            
            if (config.layer.traffic) {
                var trafficLayer = new google.maps.TrafficLayer();
                trafficLayer.setMap(map);
            }
            
            if (config.layer.weather) {
                var weatherLayer = new google.maps.weather.WeatherLayer({
                    temperatureUnits: google.maps.weather.TemperatureUnit.CELCIUS
                });
                weatherLayer.setMap(map);
            }

            if (config.layer.transit) {
                var transitLayer = new google.maps.TransitLayer();
                transitLayer.setMap(map);
            }
            
            if (config.layer.bike) {
                var bikeLayer = new google.maps.BicyclingLayer();
                bikeLayer.setMap(map);
            }
            
            if (config.layer.panoramio && google.maps.panoramio) {
                var panoramioLayer = new google.maps.panoramio.PanoramioLayer();
                panoramioLayer.setMap(map);
            }
            
            var venueFullInfoBoxStyle = new Object({
            });
            venueFullInfoBoxStyle['-moz-animation'] = "mymove .30s alternate";
            venueFullInfoBoxStyle['-webkit-animation'] = "mymove .30s alternate";
            venueInfobox = new InfoBox({
                disableAutoPan: false,
                maxWidth: 0,
                pixelOffset: new google.maps.Size(-75, -75),
                boxStyle: venueFullInfoBoxStyle,
                closeBoxMargin: "1px 1px 1px 1px",
                closeBoxURL: "img/dashboard/closebutton.png",
                infoBoxClearance: new google.maps.Size(1, 1)
            });
            
            plotAllMarks();
            
            if ($.isFunction(config.oncomplete)) {
                config.oncomplete.call(this);
            }
        }
        google.maps.event.addDomListener(window, 'load', initialize);

        return this;
    }
    
    $.fn.amigomap.updateAgenda = function(agenda){
        config.agenda = agenda;
        
        $.each(polyDisplay, function(day, apolyDisplay){
            apolyDisplay.setMap(null);
        });
        
        $.each(directionsDisplay, function(day, adirectionsDisplay){
            $.each(adirectionsDisplay, function(bday, direct){
                if( typeof direct === 'undefined' )
                    return;
                
                direct.setMap(null);
            });
        });
        
        polyDisplay = [], directionsDisplay = [], cachedroute = [], directionsService = null;
        
        $.each(markers, function(day, amarkers){
            $.each(amarkers, function(bday, marker){
                marker.setMap(null);
            });
        });
        
        $.each(markers_listeners, function(day, amarkers_listeners){
            $.each(amarkers_listeners, function(bday, markers_listener){
                google.maps.event.removeListener(markers_listener);
            });
        });
        
        plotAllMarks();
        return this;
    }

    $.fn.amigomap.showMarkers = function(day) {
        if(!config.agenda)
            throw 'Your agenda is empty.';
        
        if(! $.isArray(config.agenda))
            throw 'Your agenda is not in correct format';
        
        if(config.agenda.length <= day)
            throw 'Your agenda does not have element number:' + day;
        
        $.each(config.agenda, function(index, value){
            $.each(value, function(order, venue){
                if(! $.isArray(markers[index]))
                    throw 'Markers data is still empty';
                if(order != 0 && order != value.length - 1){
                    if(index == day){
                        markers[index][order].setIcon("http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=" + (order) + "|ffb900|000000");
                    } else {
                        markers[index][order].setIcon(config.icon.inactive);
                    }
                }
            });
        });
    }
    
    $.fn.amigomap.showDayRoute = function(options){
        var fconfig = $.extend({
            day: 0,
            onsetroute: null,
            oncachedroute: null
        }, options);
        
        if(!config.directionService)
            throw 'directionService option is not active';
            
        if(!config.agenda)
            throw 'Your agenda is empty.';
        
        if(! $.isArray(config.agenda))
            throw 'Your agenda is not in correct format';
        
        if(config.agenda.length <= fconfig.day)
            throw 'Your agenda does not have element number:' + fconfig.day;
        
        $.each(config.agenda, function(index, value){
            
            var before = null;
            var longest = null;
            var longest_reference = 0;
            var bound = new google.maps.LatLngBounds();
            
            $.each(value, function(order, venue){
                if(! $.isArray(markers[index]))
                    throw 'Markers data is still empty';
                
                var latlong = new google.maps.LatLng(venue.latitude, venue.longitude);
                if( order != 0 ) {
                    if( index == fconfig.day ){
                        bound.extend( latlong );

                        var x_distance = getDistance(
                                venue.latitude, venue.longitude,
                                before.latitude, before.longitude);
                        if( x_distance > longest_reference ){
                            longest_reference = x_distance;
                            longest = venue;
                        }

                        function getRoute(){
                            var dserver_param = {
                                origin: new google.maps.LatLng(before.latitude, before.longitude),
                                destination: latlong,
                                travelMode: before.travelmode,
                                transitOptions: {
                                    departureTime: new Date(before.start * 1000)
                                },
                                unitSystem: google.maps.UnitSystem.METRIC
                            };
                            
                            function hitroute() {
                                directionsService.route(dserver_param, function(response, status) { //Direction request is ASYNCHRONOUS
                                    if (status == google.maps.DirectionsStatus.OK) {
                                        directionsDisplay[index][order] = new google.maps.DirectionsRenderer({
                                            polylineOptions: new google.maps.Polyline({
                                                strokeColor: config.colorset[index],
                                                strokeOpacity: 0.9,
                                                strokeWeight: 6
                                            }),
                                            draggable: false,
                                            suppressMarkers: true,
                                            map: map,
                                            //preserveViewport: true
                                        });
                                        directionsDisplay[index][order].setDirections(response);
                                        cachedroute[index][order-1] = response.routes;

                                        if ( $.isFunction( fconfig.onsetroute ) ) 
                                            fconfig.onsetroute(index, order, response.routes, false); //not cached

                                    } else {
                                        /* manage retry */
                                        var wait = (status == google.maps.DirectionsStatus.OVER_QUERY_LIMIT) ? 2500 : 700;
                                        setTimeout(function() {
                                            console.log('RETRY getting route, due to:' + status);
                                            hitroute();
                                        }, (wait));
                                    }
                                });
                            }
                            hitroute();
                        }

                        if( typeof directionsDisplay[index][order] === 'undefined' )
                            getRoute();
                        else {
                            if ( $.isFunction( fconfig.oncachedroute ) ) 
                                fconfig.oncachedroute(index, order, cachedroute[index][order-1], true); //cached
                            
                            directionsDisplay[index][order].setMap(map);
                        }
                    } else {
                        if( typeof directionsDisplay[index][order] !== 'undefined' )
                            directionsDisplay[index][order].setMap(null);
                    }
                }
                
                /* set venues icon on other day to inactive */
                if(order != 0 && order != value.length - 1){
                    if(index == fconfig.day){
                        markers[index][order].setIcon("http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=" + (order) + "|ffb900|000000");
                    } else {
                        markers[index][order].setIcon(config.icon.inactive);
                    }
                }
                
                before = venue;
            });
            
            if(index == fconfig.day) {
                polyDisplay[index].setVisible(false);
                
                map.setCenter(bound.getCenter());
                var listener = google.maps.event.addListener(map, "idle", function() { 
                    map.setZoom(map.getZoom() - 1); 
                    google.maps.event.removeListener(listener); 
                });
            } else
                polyDisplay[index].setVisible(true);
        });
        
        return this;
    }
    
    $.fn.amigomap.getMarker = function(day, index){
        if(!markers[day] || !markers[day][index])
            return null;
        return markers[day][index];
    }
    
    $.fn.amigomap.trigger = function(object, action){
        return google.maps.event.trigger(object, action);
    }
    
    $.fn.amigomap.zoomout = function(increment){
        var intRegex = /^\d+$/;
        if(! intRegex.test(increment)) {
           throw 'Please put valid integer value as argument';
        }
        var listener = google.maps.event.addListener(map, "idle", function() { 
            map.setZoom(map.getZoom() - increment); 
            google.maps.event.removeListener(listener); 
        });
    }
    
    $.fn.amigomap.zoomin = function(increment){
        var intRegex = /^\d+$/;
        if(! intRegex.test(increment)) {
           throw 'Please put valid integer value as argument';
        }
        var listener = google.maps.event.addListener(map, "idle", function() { 
            map.setZoom(map.getZoom() + increment); 
            google.maps.event.removeListener(listener); 
        });
    }
    
    function plotAllMarks() {
        $.each(config.agenda, function(index, value){
            markers[index] = [];
            markers_listeners[index] = [];
            var paths = [];
            $.each(value, function(order, venue){
                var latlong = new google.maps.LatLng(venue.latitude, venue.longitude);
                if(index == 0 && order == 0) /* set map to center of first venue */
                    map.setCenter(latlong);

                paths.push(latlong);
                if(order == 0 || order == value.length - 1){
                    markers[index][order] = new google.maps.Marker({
                        position: latlong,
                        map: map,
                        icon: config.icon.hotel
                    });
                } else {
                    markers[index][order] = new google.maps.Marker({
                        position: latlong,
                        map: map,
                        icon: config.icon.inactive
                    });
                }

                markers_listeners[index][order] = google.maps.event.addListener(markers[index][order], 'click', function() {
                    venueInfobox.setContent('<div><div class="placetooltipbox"><center><span class="placetooltiptext">' +venue.name+ '</span></center></div><img src="img/dashboard/triangle.png" class="placetooltiptriangle"></div>');
                    venueInfobox.open(map, this);
                    map.panTo(markers[index][order].getPosition());
                });

                if ( $.isFunction( config.onsetmarker ) ) 
                    config.onsetmarker(index, order, markers[index][order]);

            });

            if(config.directionService) {
                polyDisplay[index] = new google.maps.Polyline({
                    path: paths,
                    strokeColor: config.colorset[index],
                    strokeOpacity: 0.6,
                    strokeWeight: 3
                });
                polyDisplay[index].setMap(map);
                polyDisplay[index].setVisible(true);

                directionsDisplay[index] = [];
                cachedroute[index] = [];
                directionsService = new google.maps.DirectionsService();
            }
        });
    }
    
    function getDistance(lat1,lon1,lat2,lon2) {
        var R = 6371; // Radius of the earth in km
        var dLat = deg2rad(lat2-lat1);  // deg2rad below
        var dLon = deg2rad(lon2-lon1); 
        var a = 
          Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
          Math.sin(dLon/2) * Math.sin(dLon/2)
          ; 
        var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
        var d = R * c; // Distance in km
        return d;
    }

    function deg2rad(deg) {
        return deg * (Math.PI/180)
    }
    
    var sample_agenda = [
        [
            {
                "id": "HTL8f158e964c2c7124c9d30908ad11443f",
                "name": "Fragrance Hotel",
                "description": "Best Hotel",
                "latitude": 1.297053,
                "longitude": 103.855637,
                "travelmode": "DRIVING",
                "start": 1387702800,
                "duration": 0
            },
            {
                "id": "ATT17fb552c185d79b5d2cf8f94a14a79f3",
                "name": "Boat Quay",
                "description": "browse the nightlife",
                "latitude": 1.316304,
                "longitude": 103.942757,
                "travelmode": "DRIVING",
                "start": 1387702800,
                "duration": 7200
            },
            {
                "id": "ATT8c362f987057ecaceb93a665b48b8bf7",
                "name": "Dragonwick Gallery",
                "description": "curate some arts",
                "latitude": 1.326710,
                "longitude": 103.897949,
                "travelmode": "DRIVING",
                "start": 1387710000,
                "duration": 5400
            },
            {
                "id": "HTL8f158e964c2c7124c9d30908ad11443f",
                "name": "Fragrance Hotel",
                "description": "Best Hotel",
                "latitude": 1.297053,
                "longitude": 103.855637,
                "start": 1387702800,
                "duration": 0
            }
        ],
        [
            {
                "id": "HTL8f158e964c2c7124c9d30908ad11443f",
                "name": "Fragrance Hotel",
                "description": "Best Hotel",
                "latitude": 1.297053,
                "longitude": 103.855637,
                "travelmode": "DRIVING",
                "start": 1387702800,
                "duration": 0
            },
            {
                "id": "ATT2e2532175e701fabaeaa7a3d9b47c499",
                "name": "Singapore Zoo",
                "description": "up close the wildlife",
                "latitude": 1.403792,
                "longitude": 103.786964,
                "travelmode": "DRIVING",
                "start": 1387789200,
                "duration": 12600
            },
            {
                "id": "ATTda695fb6212d38c0152ebfa21a9db04f",
                "name": "Statue of Raffles",
                "description": "popular icon of singapore",
                "latitude": 1.352083,
                "longitude": 103.819839,
                "travelmode": "WALKING",
                "start": 1387807200,
                "duration": 3600
            },
            {
                "id": "HTL8f158e964c2c7124c9d30908ad11443f",
                "name": "Fragrance Hotel",
                "description": "Best Hotel",
                "latitude": 1.297053,
                "longitude": 103.855637,
                "start": 1387702800,
                "duration": 0
            }
        ]
    ];

}(jQuery));