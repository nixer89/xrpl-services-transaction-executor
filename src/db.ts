import { MongoClient, Collection, DeleteWriteOpResultObject } from 'mongodb';
import { EscrowFinishDb } from './util/types';

require('log-timestamp');

export class DB {
    dbIp = process.env.DB_IP || "127.0.0.1"

    escrowFinishCollection:Collection<EscrowFinishDb> = null;

    async initDb(from: string): Promise<void> {
        console.log("init mongodb from: " + from);
        this.escrowFinishCollection = await this.getNewDbModel("EscrowFinish");
        
        return Promise.resolve();
    }

    async saveEscrow(escrow: EscrowFinishDb): Promise<any> {
        console.log("[DB]: saveEscrow:" + " escrow: " + JSON.stringify(escrow));
        try {
            if((await this.escrowFinishCollection.find({account: escrow.account, sequence: escrow.sequence, testnet: escrow.testnet}).toArray()).length == 0) {
                let insertResponse = await this.escrowFinishCollection.insertOne(escrow);
                if(insertResponse.insertedCount == 1 && insertResponse.insertedId)
                    return {success: true};
                else
                    return {success: false};
            } else {
                console.log("escrow already in the system!");
                return {success: true}; //Escrow already in system
            }
        } catch(err) {
            console.log("[DB]: error saveEscrow");
            console.log(JSON.stringify(err));
            return null;
        }
    }

    async escrowExists(escrow: EscrowFinishDb): Promise<boolean> {
        try {
            //console.log("[DB]: getEscrow: " + JSON.stringify(escrow));
            let mongoResult:EscrowFinishDb = await this.escrowFinishCollection.findOne({account: escrow.account, sequence: escrow.sequence, testnet: escrow.testnet});

            if(mongoResult && mongoResult.account == escrow.account && mongoResult.sequence == escrow.sequence && mongoResult.testnet == escrow.testnet)
                return Promise.resolve(true);
            else return Promise.resolve(false);
        } catch(err) {
            console.log("[DB]: error getEscrow");
            console.log(JSON.stringify(err));
            return Promise.resolve(false);
        }
    }

    async getEscrowFinishByAccount(account: string, testnet: boolean): Promise<EscrowFinishDb[]> {
        try {
            //console.log("[DB]: getEscrowFinishByAccount: account: " + account);
            let mongoResult:EscrowFinishDb[] = await this.escrowFinishCollection.find({account: account, testnet: testnet}).sort({finishafter: -1}).toArray();

            if(mongoResult)
                return mongoResult;
            else
                return null;
        } catch(err) {
            console.log("[DB]: error getEscrowFinishByAccount");
            console.log(JSON.stringify(err));
            return null;
        }
    }

    async getEscrowFinishByDates(startDate:Date, endDate:Date): Promise<EscrowFinishDb[]> {
        try {
            //console.log("[DB]: getEscrowFinishByDates: startDate: " + startDate.toLocaleString() + " endDate: " + endDate.toLocaleString());
            let mongoResult:EscrowFinishDb[] = await this.escrowFinishCollection.find({$and: [ {finishafter: {$gte: startDate}}, {finishafter: {$lt: endDate}}]}).sort({finishafter: -1}).toArray();

            if(mongoResult)
                return mongoResult;
            else
                return null;
        } catch(err) {
            console.log("[DB]: error getEscrowFinishByDates");
            console.log(JSON.stringify(err));
            return null;
        }
    }

    async deleteEscrowFinish(account: string, sequence: number, testnet: boolean): Promise<boolean> {
        console.log("[DB]: deleteEscrowFinish: account: " + account + " and sequence: " + sequence + " and testnet: " + testnet);
        try {
            let deleteResult:DeleteWriteOpResultObject = await this.escrowFinishCollection.deleteMany({account: account, sequence: sequence, testnet: testnet});
            console.log("deleteResult: " + JSON.stringify(deleteResult));
            return deleteResult && deleteResult.deletedCount >= 1;
        } catch(err) {
            console.log("[DB]: error deleteEscrowFinish");
            console.log(JSON.stringify(err));
            return false;
        }
    }

    async getNextOrLastEscrowRelease(sort: number): Promise<number> {
        try {
            //console.log("[DB]: getNextOrLastEscrowRelease");
            let mongoResult:EscrowFinishDb[] = await this.escrowFinishCollection.find().sort({finishafter: sort}).toArray();

            //console.log("result: " + JSON.stringify(mongoResult));
            if(mongoResult && mongoResult.length > 0)
                return mongoResult[0].finishafter.getTime();
            else
                return -1;
        } catch(err) {
            console.log("[DB]: error getNextOrLastEscrowRelease");
            console.log(JSON.stringify(err));
            return -1;
        }
    }

    async getCurrentEscrowCount(): Promise<number> {
        try {
            //console.log("[DB]: getCurrentEscrowCount");
            return this.escrowFinishCollection.countDocuments();
        } catch(err) {
            console.log("[DB]: error getCurrentEscrowCount");
            console.log(JSON.stringify(err));
            return -1;
        }
    }

    async getNewDbModel(collectionName: string): Promise<Collection<any>> {
        try {
            console.log("[DB]: connecting to mongo db with collection: " + collectionName +" and an schema");
            let connection:MongoClient = await MongoClient.connect('mongodb://'+this.dbIp+':27017', { useNewUrlParser: true, useUnifiedTopology: true });
            connection.on('error', ()=>{ console.log("[DB]: Connection to MongoDB could NOT be established") });
        
            if(connection) {
                let existingCollections:Collection<any>[] = await connection.db('XahauTransactionExecutor').collections();
                //create collection if not exists
                if(existingCollections.filter(collection => collection.collectionName === collectionName).length == 0)
                    await connection.db('XahauTransactionExecutor').createCollection(collectionName);

                return connection.db('XahauTransactionExecutor').collection(collectionName);
            }
            else
                return null;
        } catch(err) {
            console.log(err);
            return null;
        }
    }

    async ensureIndexes(): Promise<void> {
        try {
            console.log("ensureIndexes");
            //AllowedOrigins
            if((await this.escrowFinishCollection.indexes).length>0)
                await this.escrowFinishCollection.dropIndexes();

            await this.escrowFinishCollection.createIndex({account: -1});
            await this.escrowFinishCollection.createIndex({finishafter: -1});

        } catch(err) {
            console.log("ERR creating indexes");
            console.log(JSON.stringify(err));
        }
    }
}