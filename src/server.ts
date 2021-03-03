import * as apiRoute from './api';
import * as config from './util/config';

const fastify = require('fastify')({
  trustProxy: config.USE_PROXY,
  //logger: {
    //level: 'warn',
    //level: 'info',
    //file: '/home/ubuntu/fastify-logs/fastify.log' // Will use pino.destination()
  //}
});

import consoleStamp = require("console-stamp");
consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

console.log("adding response compression");
fastify.register(require('fastify-compress'));

console.log("adding some security headers");
fastify.register(require('fastify-helmet'));

// Run the server!
const start = async () => {

    console.log("starting server");
    try {

      console.log("declaring 200er reponse")
      fastify.get('/', async (request, reply) => {
        reply.code(200).send('I am alive!'); 
      });

      fastify.addHook('onRequest', (request, reply, done) => {
        
        if(request.headers.origin)
          reply.code(500).send('Only calls from a backend are allowed');
        else
          done()
        
      });

      console.log("declaring routes");
      await fastify.register(await apiRoute.registerRoutes);
      console.log("finished declaring routes");

      try {
        await fastify.listen(4011, '0.0.0.0');

        console.log("http://localhost:4011/");

        fastify.ready(err => {
          if (err) throw err
      });
      } catch(err) {
        console.log('Error starting server:', err)
      }

    } catch (err) {
      fastify.log.error(err);
      process.exit(1);
    }
}

console.log("running server");
start();