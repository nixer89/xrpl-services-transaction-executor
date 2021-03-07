import { MongoClient, Collection, Cursor, DeleteWriteOpResultObject } from 'mongodb';
import consoleStamp = require("console-stamp");
import { EscrowFinish } from './util/types';

consoleStamp(console, { pattern: 'yyyy-mm-dd HH:MM:ss' });

export class DB {
    dbIp = process.env.DB_IP || "127.0.0.1"

    escrowFinishCollection:Collection<EscrowFinish> = null;

    async initDb(from: string): Promise<void> {
        console.log("init mongodb from: " + from);
        this.escrowFinishCollection = await this.getNewDbModel("EscrowFinish");
        
        return Promise.resolve();
    }

    async saveEscrow(escrow: EscrowFinish): Promise<any> {
        console.log("[DB]: saveEscrow:" + " escrow: " + JSON.stringify(escrow));
        try {
            if((await this.escrowFinishCollection.find({account: escrow.account, sequence: escrow.sequence, testnet: escrow.testnet}).toArray()).length == 0) {
                let insertResponse = await this.escrowFinishCollection.insertOne(escrow);
                if(insertResponse.insertedCount == 1 && insertResponse.insertedId)
                    return {success: true};
                else
                    return {success: false};
            } else {
                return {success: true}; //Escrow already in system
            }
        } catch(err) {
            console.log("[DB]: error saveEscrow");
            console.log(JSON.stringify(err));
        }
    }

    async getEscrowFinishByAccount(account: string, testnet: boolean): Promise<EscrowFinish[]> {
        try {
            console.log("[DB]: getEscrowFinishByAccount: account: " + account);
            let mongoResult:EscrowFinish[] = await this.escrowFinishCollection.find({account: account, testnet}).sort({finishafter: -1}).toArray();

            if(mongoResult)
                return mongoResult;
            else
                return null;
        } catch(err) {
            console.log("[DB]: error getEscrowFinishByAccount");
            console.log(JSON.stringify(err));
        }
    }

    async getEscrowFinishByDates(startDate:Date, endDate:Date): Promise<EscrowFinish[]> {
        try {
            console.log("[DB]: getEscrowFinishByDates: startDate: " + startDate.toLocaleString() + " endDate: " + endDate.toLocaleString());
            let mongoResult:EscrowFinish[] = await this.escrowFinishCollection.find({$and: [ {finishafter: {$gte: startDate}}, {finishafter: {$lt: endDate}}]}).sort({finishafter: -1}).toArray();

            if(mongoResult)
                return mongoResult;
            else
                return null;
        } catch(err) {
            console.log("[DB]: error getEscrowFinishByDates");
            console.log(JSON.stringify(err));
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
        }
    }

    async getNewDbModel(collectionName: string): Promise<Collection<any>> {
        try {
            console.log("[DB]: connecting to mongo db with collection: " + collectionName +" and an schema");
            let connection:MongoClient = await MongoClient.connect('mongodb://'+this.dbIp+':27017', { useNewUrlParser: true, useUnifiedTopology: true });
            connection.on('error', ()=>{ console.log("[DB]: Connection to MongoDB could NOT be established") });
        
            if(connection && connection.isConnected()) {
                let existingCollections:Collection<any>[] = await connection.db('TransactionExecutor').collections();
                //create collection if not exists
                if(existingCollections.filter(collection => collection.collectionName === collectionName).length == 0)
                    await connection.db('TransactionExecutor').createCollection(collectionName);

                return connection.db('TransactionExecutor').collection(collectionName);
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