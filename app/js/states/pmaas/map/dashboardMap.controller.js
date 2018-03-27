/*global require*/
'use strict';

const statesModule = require('../../');
const keyBy = require('lodash/keyBy');
const d3 = require('d3');
const topojson = require('topojson');
const world = require('./dashboardMap.json');
const pinLocations = {
    USA: {issues: true,  offset: [30, -30]},
    CAN: {issues: false, offset: [-50, -190]},
    DEU: {issues: false, offset: [25, 45]}
};

const priv = {
    tlast: [0, 0],
    slast: null,
    pins: []
};
const c3 = require('c3');
const donutSize = 50;
const donutThickness = 4;

const donutVals     = {
    size: {
        width: donutSize,
        height: donutSize
    },
    donut: { width: donutThickness },
    data: { type: 'donut' },
    legend: { show: false }
};

function donutSettings(obj) {
    return Object.assign({}, donutVals, obj);
}

const charts = [
    {
        name: 'vulnerability',
        columns: [
            ['Secure systems', 982],
            ['Vulnerable systems', 218]
        ],
        title: '82%',
        color: {
            pattern: [
                '#0088CE',
                '#d1d1d1'
            ]
        }
    },

    {
        name: 'compliance',
        columns: [
            ['Compliant systems', 816],
            ['Noncompliant systems', 384]
        ],
        title: '68%',
        color: {
            pattern: [
                '#0088CE',
                '#d1d1d1'
            ]
        }
    },

    {
        name: 'advisor',
        columns: [
            ['Rules evaluated', 90],
            ['Rules passed', 65]
        ],
        title: '58%',
        color: {
            pattern: [
                '#0088CE',
                '#d1d1d1'
            ]
        }
    },

    {
        name: 'subscription',
        columns: [
            ['RHEL', 1050],
            ['Openshift', 100],
            ['Openstack', 50],
            ['Available', 25]
        ],
        title: '98%',
        color: {
            pattern: [
                '#cc0000',
                '#0088CE',
                '#2d7623',
                '#d1d1d1'
            ]
        }
    }
];

// returns the angle in degrees between two points on the map
// used for the x tranlation for infinite scroll
// const getAngle = (p1, p2) => (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;

priv.mercatorBounds = (projection, maxlat) => {
    // find the top left and bottom right of current projection
    const yaw = projection.rotate()[0];
    const xymax = projection([-yaw + 180 - 1e-6,-maxlat]);
    const xymin = projection([-yaw - 180 + 1e-6, maxlat]);
    return [xymin, xymax];
};

priv.getConf = () => {
    const div = document.querySelector('#map');
    const ret = {
        width: div.scrollWidth,
        height: div.scrollHeight,
        rotate: -10,
        maxLatitude: 86
    };

    return ret;
};

priv.getScale = (projection, maxLatitude, width) => {
    // set up the scale extent and initial scale for the projection
    const bounds = priv.mercatorBounds(priv.projection, maxLatitude);
    const scale  = width / (bounds[1][0] - bounds[0][0]);
    return [scale, 15 * scale];
};

priv.reInit = (conf) => {
    priv.projection
        .rotate([conf.rotate, 0])
        .scale(priv.scaleExtent[0])
        .translate([conf.width / 2, conf.height / 2]);

    // priv.zoom
    //     .scale(priv.projection.scale())
    //     .translate([0, 0]);

    priv.svg
        .attr('width', conf.width)
        .attr('height', conf.height);

    priv.redraw();
};

priv.init = (conf) => {
    priv.projection = d3.geo.mercator()
        .rotate([conf.rotate, 0])
        .scale(1)
        .translate([conf.width / 2, (conf.height / 2) + 100]);

    priv.scaleExtent = priv.getScale(priv.projection, conf.maxLatitude, conf.width);

    priv.projection.scale(priv.scaleExtent[0]);

    priv.zoom = d3.behavior.zoom()
        .scaleExtent(priv.scaleExtent)
        .scale(priv.projection.scale())
        .translate([0, 0]); // not linked directly to projection
    // .on('zoom', priv.redraw);

    priv.path = d3.geo.path()
        .projection(priv.projection);

    priv.svg = d3.select('.map')
        .append('svg')
        .attr('width', conf.width)
        .attr('height', conf.height)
        .call(priv.zoom);

    priv.centroids = priv.svg.append('g')
        .attr('class', 'centroid');

    priv.svg.selectAll('path')
        .data(topojson.feature(world, world.objects.countries).features)
        .enter().append('path')
        .attr('d', (d) => {
            if (pinLocations[d.id]) {
                const pin = priv.centroids.append('svg:image')
                      .attr('data-toggle-target', d.id)
                      .attr('xlink:href', 'static/images/i_pin-good.svg')
                      .attr('width', 50)
                      .attr('height', 50)
                      .style('display', 'inline');

                if (pinLocations[d.id].issues) {
                    pin.attr('xlink:href', 'static/images/i_pin-has-error.svg');
                }

                priv.updatePin(pin, d);

                priv.pins.push({
                    parent: d,
                    drawable: pin
                });
            }
        });

    priv.redraw();
};

priv.updatePin = (drawable, parent) => {
    drawable.attr('transform', () => {
        const centroid = priv.path.centroid(parent);
        window.p = parent;
        window.test = priv.path;
        centroid[0] = centroid[0] - pinLocations[parent.id].offset[0];
        centroid[1] = centroid[1] - pinLocations[parent.id].offset[1];
        return `translate(${centroid})`;
    });
};

priv.redraw = () => {
    if (d3.event) {
        priv.projection.scale(d3.event.scale);
        priv.pins.forEach(p => priv.updatePin(p.drawable, p.parent));
    }

    priv.svg.selectAll('path').attr('d', priv.path);
};

function generateCharts(chartData) {
    for (const data of chartData) {
        c3.generate(donutSettings({
            bindto: `.chart-${data.name}`,
            data: {
                columns: data.columns,
                type: 'donut',
                labels: false
            },
            donut: {
                title: data.title,
                width: donutThickness
            },
            color: data.color
        }));
    }
}

function DashboardMapCtrl($timeout, $scope) {
    $timeout(() => {
        priv.init(priv.getConf());
    }, 0.25);

    window.onresize = () => priv.reInit(priv.getConf());

    $scope.charts = keyBy(charts, 'name');
    generateCharts(charts);

    d3.select('.chart-vulnerability').select('.c3-chart-arcs-title')
        .append('tspan')
        .attr('dy', 25)
        .attr('x', 0)
        .text('Secure');

    d3.select('.chart-compliance').select('.c3-chart-arcs-title')
        .append('tspan')
        .attr('dy', 25)
        .attr('x', 0)
        .text('Compliant');

    d3.select('.chart-advisor').select('.c3-chart-arcs-title')
        .append('tspan')
        .attr('dy', 25)
        .attr('x', 0)
        .text('Optimized');

    d3.select('.chart-subscription').select('.c3-chart-arcs-title')
        .append('tspan')
        .attr('dy', 25)
        .attr('x', 0)
        .text('Utilized');

    d3.select('.container')
        .insert('div', '.chart')
        .attr('class', 'legend')
        .selectAll('span')
        .data(['data1', 'data2', 'data3'])
        .enter().append('span')
        .attr('data-id', function (id) { return id; })
        .html(function (id) { return id; });
}

statesModule.controller('DashboardMapCtrl', DashboardMapCtrl);
