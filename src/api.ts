import { EscrowExecutor } from './escrowExecutor';
import { EscrowFinishDb } from './util/types';
import { Encode } from 'xrpl-tagged-address-codec';

require('log-timestamp');

export async function registerRoutes(fastify, opts, next) {

    let escrowExecutor:EscrowExecutor = new EscrowExecutor();
    await escrowExecutor.init();

    fastify.post('/api/v1/escrowFinish', async (request, reply) => {
        //console.log("post payload headers: " + JSON.stringify(request.headers));
        //console.log("post body escrowFinish: " + request.body);
        if(!request.body)
            return {success: false, error: true, message: "Please provide a body"};
        else {
            try {
                let parsedBody:any = JSON.parse(request.body);

                if(!parsedBody.account || !parsedBody.sequence || !parsedBody.finishafter || (!parsedBody.testnet && parsedBody.testnet != false))
                    return { success : false, error: true, message: "Post body incomplete. Please provide 'account', 'sequence', 'finishafter' and 'testnet' properties"};
                else if(!isValidXRPAddress(parsedBody.account))
                    return { success : false, error: true, message: "Invalid XRP Ledger account address. Can not accept your request."};
                else {
                    //try parsing the user agent when unknown to determine if web or app
                    
                    let escrowFinish:EscrowFinishDb = {
                        account: parsedBody.account,
                        sequence: parsedBody.sequence,
                        finishafter: new Date(parsedBody.finishafter),
                        testnet: parsedBody.testnet
                    };
                    
                    let result = await escrowExecutor.addNewEscrow(escrowFinish);
                    return { success: result.success, error: false }
                        
                }
            } catch (err) {
                console.log("ERROR: " + JSON.stringify(err));
                return { success : false, error: true, message: 'Something went wrong. Could not save Escrow.'};
            }
        }
    });

    fastify.delete('/api/v1/escrowFinish/:account/:sequence/:testnet', async (request, reply) => {
        //console.log("delete params: " + JSON.stringify(request.params));
        if(!request.params || !request.params.account || !request.params.sequence || !request.params.testnet) {
            return { success : false, error: true, message: "Params incomplete. Please provide at least 'account', 'sequence' and 'testnet' properties"};
        } else if(!isValidXRPAddress(request.params.account)) {
            return { success : false, error: true, message: "Invalid XRP Ledger account address. Can not accept your request."};
        } else {
            //console.log("go on and delete");
            try {
                let escrowToDelete:EscrowFinishDb = {
                    account: request.params.account,
                    sequence: Number(request.params.sequence),
                    finishafter: null,
                    testnet: request.params.testnet == 'true'
                };

                let success:boolean = await escrowExecutor.deleteEscrow(escrowToDelete);
                return { success: success, error: false }
            } catch (err) {
                console.log("ERROR: " + JSON.stringify(err));
                return { success : false, error: true, message: 'Something went wrong. Could not delete Escrow'};
            }
        }
    });

    fastify.get('/api/v1/escrowFinish/exists/:account/:sequence/:testnet', async (request, reply) => {
        //console.log("delete params: " + JSON.stringify(request.params));
        if(!request.params || !request.params.account || !request.params.sequence || !request.params.testnet) {
            return { success : false, error: true, message: "Params incomplete. Please provide at least 'account', 'sequence' and 'testnet' properties"};
        } else if(!isValidXRPAddress(request.params.account)) {
            return { success : false, error: true, message: "Invalid XRP Ledger account address. Can not accept your request."};
        } else {
            //console.log("go on and delete");
            try {
                let escrowToFind:EscrowFinishDb = {
                    account: request.params.account,
                    sequence: Number(request.params.sequence),
                    finishafter: null,
                    testnet: request.params.testnet == 'true'
                };

                let exsists:boolean = await escrowExecutor.escrowExists(escrowToFind);
                return { success: exsists, error: false }
            } catch(err) {
                console.log("ERROR: " + JSON.stringify(err));
                return { success : false, error: true, message: 'Escrow not found'};
            }
        }
    });

    fastify.post('/api/v1/escrows', async (request, reply) => {
        //console.log("body params escrow backend: " + request.body);
        if(!request.body) {
            reply.code(500).send('Please provide a body. Calls without body are not allowed.');
        } else {
            let parsedBody:any = JSON.parse(request.body);
            if(!parsedBody.account) {
                reply.code(500).send('Please provide a XRPL account. Calls without XRPL account are not allowed.');
            } else if(!isValidXRPAddress(parsedBody.account)) {
                //console.log("invalid account");
                reply.code(500).send('Invalid XRP Ledger account address. Can not accept your request.');
            } else {
                //console.log("get that data!");
                try {
                    let escrows:EscrowFinishDb[] = await escrowExecutor.getEscrowsForAccount(parsedBody.account, parsedBody.testnet);
                    return {
                        success: true,
                        escrows: escrows,
                        error: false
                    };
                } catch(err) {
                    console.log("ERROR: " + JSON.stringify(err));
                    return { success : false, error: true, message: 'Something went wrong. Could not get Escrows.'};
                }
            }
        }
    });

    fastify.get('/api/v1/stats/currentCount', async (request, reply) => {
        //console.log("stats/currentCount");
        try {
            return escrowExecutor.getCurrentEscrowCount();
        } catch(err) {
            console.log("ERROR: " + JSON.stringify(err));
            return -1;
        }
    });

    fastify.get('/api/v1/stats/nextRelease', async (request, reply) => {
        //console.log("stats/currentCount");
        try {
            return escrowExecutor.getNextOrLastEscrowRelease(1);
        } catch(err) {
            console.log("ERROR: " + JSON.stringify(err));
            return -1;
        }
    });

    fastify.get('/api/v1/stats/lastRelease', async (request, reply) => {
        //console.log("stats/currentCount");
        try {
            return escrowExecutor.getNextOrLastEscrowRelease(-1);
        } catch(err) {
            console.log("ERROR: " + JSON.stringify(err));
            return -1;
        }
    });
    
    next()

    return Promise.resolve();
}

function isValidXRPAddress(account: string): boolean {
    try {
      //console.log("encoding address: " + address);
      let xAddress = Encode({account: account});
      //console.log("xAddress: " + xAddress);
      return xAddress && xAddress.length > 0;
    } catch(err) {
      //no valid address
      //console.log("err encoding " + err);
      return false;
    }
  }

