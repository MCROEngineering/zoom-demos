const ZoomLibrary = window.exports.ZoomLibrary;

let totalProcessTime = 0,
    totalCalls = 0,
    startTime = 0,
    web3,
    itemData = [],
    itemAddressValues = [],
    testItemContracts = [],
    batchPromises = [];
    
const settings = {
    item_num: 0,
    provider_url: "",
    request_type: "",
    items_per_batch: 500,
    addresses: {
        // ropsten
        ListContract: "0x1d5cb16376911d3832efb4130670c4a6a47fb82f",
        ZoomContract: "0x06015a207fb22eb6d81585e1694c8fff405ee4a4",

        // rinkeby
        // ListContract: "0x60b1151b564b3d2321ce641914001ec97d009d47",
        // ZoomContract: "0xe07a33e2975b7012eb9bf002aa12aba98d7069dc",
    }
};

const ItemSmartContractMethods = [
    "getName", "getAsset", "getUint8", "getUint16", "getUint32", "getUint64",
    "getUint128", "getUint256", "getString8", "getString16", "getString32",
    "getString64", "getAddress", "getBoolTrue", "getBoolFalse", "getBytes8",
    "getBytes16", "getBytes32", "getBytes"
];


$( document ).ready(function() {
    LoadABIData().then( () => {
        setupUI();
        // runTest( "web3" );
        // runTest( "zoom" );
    });
});

async function LoadABIData() {

    settings.abiData = {
        ListContract: await $.getJSON('assets/contracts/ListContract.json'),
        ItemEntity: await $.getJSON('assets/contracts/ItemEntity.json'),
        Zoom: await $.getJSON('assets/contracts/Zoom.json')
    }

    settings.zoom = {
        // add zoom binary calls
        calls : {
            call_1: await $.getJSON('assets/zoom/binary_1.json'),
            call_10: await $.getJSON('assets/zoom/binary_10.json'),
            call_25: await $.getJSON('assets/zoom/binary_25.json'),
            call_50: await $.getJSON('assets/zoom/binary_50.json'),
            call_100: await $.getJSON('assets/zoom/binary_100.json'),
            call_150: await $.getJSON('assets/zoom/binary_150.json'),
            call_200: await $.getJSON('assets/zoom/binary_200.json'),
            call_250: await $.getJSON('assets/zoom/binary_250.json'),
        }
    }
}

function setupUI() {

    if( $("#inputProvider").val() === "custom") {
        $("#inputProviderCustom").parent().show();
    } else {
        $("#inputProviderCustom").parent().hide();
    }

    $("#inputProvider").bind("change", (e) => {
        if($( e.target ).val() === "custom") {
            $("#inputProviderCustom").parent().show();
        } else {
            $("#inputProviderCustom").parent().hide();
        }
    })

    /*
    $("#inputTestType").bind("change", (target) => {

        const type = $("#inputTestType").val();
        if(type === "batched") {
            $("#inputProvider option").each(function() {
                if($(this).val().substr(0, 2) === "ws") {
                    $(this).attr("disabled", false);
                }
            });
        } else {
            $("#inputProvider option").each(function() {
                if($(this).val().substr(0, 2) === "ws") {
                    $(this).attr("disabled", true);
                }
            });
        }
    })
    */
    

    $("#run_web3").bind("click", () => {
        runTest( "web3" );
    })

    $("#run_zoom").bind("click", () => {
        runTest( "zoom" );
    })

}

async function runTest( type ) {

    setupProviderAndSettings();

    totalProcessTime = 0;
    totalCalls = 0;
    startTime = getTime();
    itemData = [];
    itemAddressValues = [];
    testItemContracts = [];

    $("#"+type+"-result").html( "" );

    if(type === "web3") {
    
        const ListContract = await new web3.eth.Contract(settings.abiData.ListContract.abi, settings.addresses.ListContract);
        if( settings.request_type === "async") {
            LoadDataAsync( ListContract );

        } else if( settings.request_type === "batched") {
            LoadDataBatch( ListContract );

        }
    } else if(type === "zoom") {
        LoadDataZoom();
    }
}

async function LoadDataZoom() {
    
    let ZoomProvider;

    if(settings.provider_url.substr(0, 2) === "ws") {
        ZoomProvider = new ZoomLibrary.WsProvider( settings.provider_url );
    } else {
        ZoomProvider = new ZoomLibrary.HttpProvider( settings.provider_url );
    }
    ZoomProvider.enableCache(true);

    web3.setProvider(ZoomProvider);

    const ZoomLibraryInstance = new ZoomLibrary.Zoom({
        use_reference_calls: false // true if you want to use type 2
    });
    
    const ZoomQueryBinary = ZoomLibraryInstance.toBuffer( settings.zoom.calls["call_" + settings.item_num].data );

    // Initialize the Zoom Web3 Contract
    const ZoomContractInstance = await new web3.eth.Contract(settings.abiData.Zoom.abi, settings.addresses.ZoomContract);

    const combinedResult = await ZoomContractInstance.methods.combine( ZoomQueryBinary ).call();

    const newDataCache = ZoomLibraryInstance.resultsToCache( combinedResult, ZoomQueryBinary );
    ZoomProvider.setCache(newDataCache);
    
    const ListContract = await new web3.eth.Contract(settings.abiData.ListContract.abi, settings.addresses.ListContract);

    totalCalls++;
    totalProcessTime += getTime() - startTime;
    updateResult( "zoom" );

    return LoadDataAsync( ListContract, true );
}

async function LoadDataAsync( ListContract, zoom = false ) {

    // async address values
    for(let i = 1; i <= settings.item_num; i++) {
        itemAddressValues.push( ListContract.methods.items(i).call() );
    }

    return Promise.all(itemAddressValues).then(function(values) {

        // async instantiate contracts
        for( let i = 0; i < values.length; i++) {
            // based on loaded address, instantiate child contract
            testItemContracts.push( new web3.eth.Contract(settings.abiData.ItemEntity.abi, values[i].itemAddress) );
            totalCalls++;
        }

        // return Promise.all(testItemContracts).then(function(contracts) {

            const items = [];
            for( let i = 0; i < values.length; i++) {
                items.push( 
                    new Promise(function(resolve, reject) {

                        LoadItemProperties( testItemContracts[i] ).then( (data) => {
                            Promise.all(data).then( (e) => {
                                itemData[i] = {};
                                itemData[i]["address"] = values[i].itemAddress;
                                for(let y = 0; y < ItemSmartContractMethods.length; y++) {
                                    itemData[i][ItemSmartContractMethods[y]] = e[y];
                                }
                                resolve( itemData[i] );
                            });
                        }) 
                    })
                );
            }

            return Promise.all(items).then(function(data) {
                if(zoom === false) {
                    totalProcessTime += getTime() - startTime;
                    updateResult( "web3" );
                }
            });
        });
    // });
}

async function LoadItemProperties( itemContractInstance ) {
    let item = [];
    for(let i = 0; i < ItemSmartContractMethods.length; i++) {
        item.push( itemContractInstance.methods[ ItemSmartContractMethods[i] ]().call() );
        totalCalls++
    }
    return item;
}

async function LoadDataBatch( ListContract ) {

    // we're limited to 1k calls in 1 batch request by infura,
    // so we're batching the item call first
    // then creating an array of all calls we need to make
    // and split those up in 500 call requests

    await getItemContracts( ListContract );

    // Promise.all(testItemContracts).then(function(contracts) {

        const batches = [];
        let callsInBatch = 0;
        let thisBatch = new web3.BatchRequest();
        let requests = [];

        for( let i = 0; i < testItemContracts.length; i++) {
            itemData[i] = {};
            itemData[i]["address"] = testItemContracts[i]._address;
            for(let y = 0; y < ItemSmartContractMethods.length; y++) {

                if(callsInBatch === 0) {
                    batches.push( {
                        obj: thisBatch,
                        calls: requests
                    });
                }

                callsInBatch++;
                requests.push( 
                    new Promise(function(resolve, reject) {
                        thisBatch.add(
                            testItemContracts[i].methods[ ItemSmartContractMethods[y] ]().call.request({}, 
                                (err, retdata) => {
                                    itemData[i][ItemSmartContractMethods[y]] = retdata;
                                    resolve(retdata);
                                }
                            )
                        );
                    })
                );

                if(callsInBatch === settings.items_per_batch) {
                    callsInBatch = 0;
                    thisBatch = new web3.BatchRequest();
                    requests = [];
                    totalCalls++;
                }
            }
        }

        batches.forEach( async (data) => {
            data.obj.execute();
            await Promise.all(data.calls);
        })

        totalProcessTime += getTime() - startTime;
        updateResult( "web3" );
        
    // });
    
}

async function getItemContracts( ListContract ) {

    totalCalls++;
    const batch = new web3.BatchRequest();
    for(let i = 1; i <= settings.item_num; i++) {
        batchPromises.push(        
            new Promise((resolve, reject) => {
                batch.add(
                    ListContract.methods.items(i).call.request({}, 
                        (err, retdata) => {
                            //console.log( err, retdata );
                            itemAddressValues.push( retdata );
                            resolve(retdata);
                        }
                    )
                );
            })
        );
    }

    batch.execute();

    return Promise.all(batchPromises).then(function(values) {
        for( let i = 0; i < values.length; i++) {
            testItemContracts.push( new web3.eth.Contract(settings.abiData.ItemEntity.abi, values[i].itemAddress) );
        }
        batchPromises = [];
    });
    
}

function setupProviderAndSettings() {
    settings.item_num = $("#inputItemNum").val();

    const provider = $("#inputProvider").val();
    if(provider === "custom") {
        const custom_provider = $("#inputProviderCustom").val();
        if(custom_provider !== "") {
            settings.provider_url = custom_provider;
        } else {
            alert("Please set custom provider");
            return;
        }
    } else {
        settings.provider_url = provider;
    }
    
    settings.request_type = $("#inputTestType").val();

    if( settings.provider_url.substr(0, 2) === "ws" ) { 
        web3 = new Web3( new Web3.providers.WebsocketProvider( settings.provider_url ) );
    } else {
        web3 = new Web3( new Web3.providers.HttpProvider( settings.provider_url ) );
    }
}

function getTime() {
    return window.performance && window.performance.now && window.performance.timing && window.performance.timing.navigationStart ? window.performance.now() + window.performance.timing.navigationStart : Date.now();
}

function updateResult( type ) {

    var data = "";
    data += "Item Count: " + settings.item_num + "<br />";
    data += "Provider URL: " + settings.provider_url + "<br />";
    data += "Type: " + type + "<br />";
    data += "Request Type: " + settings.request_type+"<br />";
    data += "Process Time: " + totalProcessTime / 1000 + "<br />";
    data += "Total Calls: " + totalCalls+"<br />";
    
    data += "";

    $("#"+type+"-result").html( data );
}