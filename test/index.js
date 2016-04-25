var should = require('chai').should()
var deduce = require('../index.js')
var data = require('./testdata.json')

describe('Basic data properties, dimensions, and groups', function() {
    it('Should create dimension accessor functions and group functions', function(done) {
        this.timeout(5000)
        var properties = deduce(data)
        should.exist(properties.dimensions)

        console.log("Dimensions")
        console.log(properties.dimensions)

        should.exist(properties.groups)

        console.log("\nGroups")
        console.log(properties.groups)

        should.exist(properties.timeRange)

        console.log("\nTime Extent")
        console.log(new Date(properties.timeRange[0]) + ' to ' + new Date(properties.timeRange[1]))
        done()
    })
})
