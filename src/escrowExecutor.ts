import * as scheduler from 'node-schedule';
import { AccountObjectsRequest, Client, EscrowCreate, EscrowFinish, TransactionEntryRequest, TxRequest, Wallet, rippleTimeToISOTime } from 'xrpl';
import { DB } from './db';
import { EscrowFinishDb } from './util/types';
import { Escrow } from 'xrpl/dist/npm/models/ledger';

require('log-timestamp');

export class EscrowExecutor {

    server:string = 'wss://s2.ripple.com';
    server_test:string ='wss://s.altnet.rippletest.net';
    xrpl_address:string = process.env.XRPL_ADDRESS || 'rpzR63sAd7fc4tR9c8k6MR3xhcZSpTAYKm';
    xrpl_secret:string = process.env.XRPL_SECRET || 'sskorjvv5bPtydsm5HtU1f2YxxA6D';

    api:Client;
    api_test:Client;
    db:DB = new DB();
    wallet:Wallet = Wallet.fromSeed(this.xrpl_secret);

    public async init() {
    
        this.api = new Client(this.server);
        this.api_test = new Client(this.server_test);
        
        await this.db.initDb("escrowExecutor");
        await this.db.ensureIndexes();

        scheduler.scheduleJob({minute: 0}, () => this.loadEscrowsFromDbAndExecute());
        scheduler.scheduleJob({minute: 5}, () => this.loadEscrowsFromDbAndExecute());
        scheduler.scheduleJob({minute: 10}, () => this.loadEscrowsFromDbAndExecute());
        scheduler.scheduleJob({minute: 15}, () => this.loadEscrowsFromDbAndExecute());
        scheduler.scheduleJob({minute: 20}, () => this.loadEscrowsFromDbAndExecute());
        scheduler.scheduleJob({minute: 25}, () => this.loadEscrowsFromDbAndExecute());
        scheduler.scheduleJob({minute: 30}, () => this.loadEscrowsFromDbAndExecute());
        scheduler.scheduleJob({minute: 35}, () => this.loadEscrowsFromDbAndExecute());
        scheduler.scheduleJob({minute: 40}, () => this.loadEscrowsFromDbAndExecute());
        scheduler.scheduleJob({minute: 45}, () => this.loadEscrowsFromDbAndExecute());
        scheduler.scheduleJob({minute: 50}, () => this.loadEscrowsFromDbAndExecute());
        scheduler.scheduleJob({minute: 55}, () => this.loadEscrowsFromDbAndExecute());

        setTimeout(() => {
            this.fetchEscrowsFromXrplAndInsertIntoDb();
        });
    }

    public async addNewEscrow(escrow: EscrowFinishDb): Promise<any> {
        return this.db.saveEscrow(escrow);
    }

    public async deleteEscrow(escrow: EscrowFinishDb): Promise<boolean> {
        return this.db.deleteEscrowFinish(escrow.account, escrow.sequence, escrow.testnet);
    }

    public async escrowExists(escrow: EscrowFinishDb): Promise<boolean> {
        return this.db.escrowExists(escrow);
    }

    public async getEscrowsForAccount(account: string, testnet: boolean): Promise<EscrowFinishDb[]> {
        return this.db.getEscrowFinishByAccount(account, testnet);
    }

    private async loadEscrowsFromDbAndExecute(): Promise<void> {
        //load escrows which had to be executed within the last our and execute them now
        let startDate:Date = new Date(0);

        let endDate:Date = new Date();
        endDate.setMinutes(endDate.getMinutes()-5);

        let escrows:EscrowFinishDb[] = await this.db.getEscrowFinishByDates(startDate, endDate);

        for(let i = 0; i < escrows.length; i++) {
            let success = await this.executeEscrowFinish(escrows[i]);
            if(success)
                await this.db.deleteEscrowFinish(escrows[i].account, escrows[i].sequence, escrows[i].testnet);
        }

        return Promise.resolve();
    }

    private async executeEscrowFinish(escrow: EscrowFinishDb, retry?: boolean): Promise<boolean> {
        try {
            console.log("preparing escrow: " + JSON.stringify(escrow));

            let apiToUse:Client = !escrow.testnet ? this.api : this.api_test;

            if(!apiToUse.isConnected())
                await apiToUse.connect();

            let escrowAccount = "";
            let escrowMemo = null;

            if(escrow.account.includes("|")) {
                escrowAccount = escrow.account.split("|")[0];
                escrowMemo = escrow.account.split("|")[1];
                console.log(escrowMemo);
            } else {
                escrowAccount = escrow.account;
            }

            let escrowFinish:EscrowFinish = {
                Account: this.xrpl_address,
                OfferSequence: escrow.sequence,
                Owner: escrowAccount,
                TransactionType: 'EscrowFinish'
            }

            if(escrowMemo) {
                escrowFinish.Memos = JSON.parse(escrowMemo);
            }

            console.log("submitting escrowFinish transaction")
            let result = await apiToUse.submitAndWait(escrowFinish, {autofill: true, wallet: this.wallet});
            console.log("submitting result: " + JSON.stringify(result));

            if(apiToUse.isConnected)
                await apiToUse.disconnect();
                
            if(!result || typeof(result.result.meta) === 'object' && result.result.meta.TransactionResult != "tesSUCCESS") {
                if(result && typeof(result.result.meta) === 'object' && ("tecNO_TARGET" === result.result.meta.TransactionResult || "tecNO_PERMISSION" === result.result.meta.TransactionResult)) {
                    //escrow does not exist anymore or cannot be finished (has condition or can only be cancelled)
                    return Promise.resolve(true);
                }
                else if(!retry)
                    return this.executeEscrowFinish(escrow, true);
                else
                    return Promise.resolve(false);
            } else {
                return Promise.resolve(true);
            }
        } catch(err) {
            console.log(err);
            if(escrow && escrow.testnet) {
                console.log("Error executing escrow on testnet: " + JSON.stringify(err));
                console.log("Skipping escrow on testnet!");

                //return true to not retry on testnet
                return Promise.resolve(true);
            }
            return Promise.resolve(false);
        }
    }

    public async getCurrentEscrowCount(): Promise<number> {
        return await this.db.getCurrentEscrowCount();
    }

    public async getNextOrLastEscrowRelease(sort: number): Promise<number> {
        return await this.db.getNextOrLastEscrowRelease(sort);
    }


    escrowsSaved:number = 0;
    private async fetchEscrowsFromXrplAndInsertIntoDb(marker?: string): Promise<void> {
        try {
            let accObjectsRequest:AccountObjectsRequest = {
                command: 'account_objects',
                account: "rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY",
                ledger_index: 'validated',
                limit: 1000,
                marker: marker,
                type: 'escrow'
            };

            if(!this.api.isConnected())
                await this.api.connect();

            let response = await this.api.request(accObjectsRequest);

            if(response && response.result && Array.isArray(response.result.account_objects)) {
                for(let i = 0; i < response.result.account_objects.length; i++) {
                    let escrow:Escrow = response.result.account_objects[i] as Escrow;

                    let requestTransaction:TxRequest = {
                        command: 'tx',
                        transaction: escrow.PreviousTxnID
                    };

                    let txResponse = await this.api.request(requestTransaction);

                    if(txResponse && txResponse.result && txResponse.result.meta && typeof(txResponse.result.meta) == 'object' && txResponse.result.TransactionType === 'EscrowCreate') {
                        // Successfully retrieved transaction
                        let transactionSequence = txResponse.result.Sequence;
                        let transactionMemo = txResponse.result.Memos;
                        let destTag = txResponse.result.DestinationTag;

                        if(destTag && destTag > 1) {
                            console.log("Skipping escrow with destination tag: " + destTag + " | txHash: " + txResponse.result.hash);
                            continue;
                        }

                        let escrowToInsert:EscrowFinishDb = {
                            account: escrow.Account,
                            sequence: transactionSequence,
                            finishafter: new Date(rippleTimeToISOTime(escrow.FinishAfter)),
                            testnet: false
                        }

                        if(transactionMemo) {
                            escrowToInsert.account = escrowToInsert.account + "|" + JSON.stringify(transactionMemo);
                        }

                        await this.db.saveEscrow(escrowToInsert);
                        this.escrowsSaved++;

                        if(this.escrowsSaved % 100 === 0) {
                            console.log("Saved " + this.escrowsSaved + " escrows so far.");
                        }
                    }
                }

                if(response.result.marker) {
                    // There are more objects to fetch
                    marker = response.result.marker;
                    await this.fetchEscrowsFromXrplAndInsertIntoDb(marker);
                } else {
                    console.log("Finished fetching escrows from XRPL. Total saved: " + this.escrowsSaved);
                }
            }
        } catch(err) {
            console.log(err);
            console.log("Error fetching escrows from XRPL: " + JSON.stringify(err));
        }
    }
}
