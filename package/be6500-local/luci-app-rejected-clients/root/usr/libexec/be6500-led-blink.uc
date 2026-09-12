#!/usr/bin/ucode

import * as fs from 'fs';
import * as uloop from 'uloop';

const leds = {
	red: '/sys/class/leds/led_red/brightness',
	green: '/sys/class/leds/led_green/brightness',
	blue: '/sys/class/leds/led_blue/brightness'
};

let colors = split(ARGV[0] || '', '+');
let interval = +ARGV[1] || 1000;
let value = false;
let timer;

function update() {
	value = !value;
	for (let color in colors) {
		let path = leds[color];
		if (path)
			fs.writefile(path, value ? '1\n' : '0\n');
	}
	timer.set(interval);
}

uloop.init();
timer = uloop.timer(0, update);
uloop.run();
uloop.done();
