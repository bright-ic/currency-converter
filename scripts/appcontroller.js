class CurrencyConverter {

    constructor() {
        this.registerServiceWorker();
        this.dbPromise = this.openDatabase();
        this.getAllCurrencies();
        this.networkFetchStatus = {fetchedCurrencies: false, fetchedCurrencyRate: false};
        this.fetchStatus = {
            fetchedCurFromNetwork: false, 
            fetchedExRateFromNetwork: false, 
            fetchedExRateFromCache: 0,
            fetchedExRateFromCacheErrStatus: 0
        };
    }
    /* ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
     method that registers service worker
    */
    registerServiceWorker() {
        if (!navigator.serviceWorker) return;
        navigator.serviceWorker.register('/sw.js').then(reg => {});
    } // close registerServiceWorker method
    /* ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
     create/open an indexDB database
    */
    openDatabase() {
        if (!('indexedDB' in window)) {
            console.log('This browser doesn\'t support IndexedDB');
            return Promise.resolve();
          }
        
          return idb.open('currencyConverter', 4, upgradeDb => {
                switch(upgradeDb.oldVersion) {
                    case 0:
                        upgradeDb.createObjectStore('currencies');
                    case 2:
                        upgradeDb.transaction.objectStore('currencies').createIndex('id', 'id', {unique: true});
                    case 3:
                        upgradeDb.createObjectStore('currencyRates', {keyPath: 'query'});
                        upgradeDb.transaction.objectStore('currencyRates').createIndex('query', 'query', {unique: true});
                }
         });
    }
    /* ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
     method that adds list of currencies to database store
    */
    addCurrenciesToCache(currencies) {
        this.dbPromise.then(db => {
            if (!db) return;
            
            let tx = db.transaction('currencies', 'readwrite'); // create a transaction 
            let store = tx.objectStore('currencies'); // access currencies the object store
            // loop through the currencies array and add them to the currencies object store
            for (const currency of currencies) {
                store.put(currency, currency.id);
            }
           // return tx.complete;

            // limit store to 160 items
            store.index('id').openCursor(null, "prev").then(cursor => {
                return cursor.advance(160);
            }).then(function deleteRest(cursor) {
                if (!cursor) return;
                cursor.delete();
                return cursor.continue().then(deleteRest);
            });
        }).then(() => {
            console.log('Currencies object store cache (db) updated successfully.');
         }).catch(error => console.log('Something went wrong: '+ error));
    }
    /* +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        Method that cache conversion rate
    */
    addCurrencyRateToCache(rate, fromCurrency, toCurrency) {
        this.dbPromise.then(db => {
            if (!db) return;
            
            let tx = db.transaction('currencyRates', 'readwrite'); // create a transaction 
            let store = tx.objectStore('currencyRates'); // access currency rate object stores

            let query = `${fromCurrency}_${toCurrency}`;
            // add the new entry or replace old entry with new one
            store.put({ query, rate });

            // limit store to 50 items
           store.index('query').openCursor(null, "prev").then(cursor => {
                return cursor.advance(50);
            }).then(function deleteRest(cursor){
                if (!cursor) return;
                cursor.delete();
                return cursor.continue().then(deleteRest);
            });
        }).then(() => {
            console.log('Currency rate for ' + fromCurrency + ' and ' + toCurrency + ' added to cache');
         }).catch(error => console.log('Something went wrong: '+ error));
    }
    //+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    // get cached currency rate
    getCurrencyRateFromCache(fromCurrency, toCurrency) {
       return this.dbPromise.then(db => {
            if (!db) return;

            const query = `${fromCurrency}_${toCurrency}`;
            let tx = db.transaction('currencyRates', 'readwrite'); // create a transaction 
            let store = tx.objectStore('currencyRates'); // access currency rate object stores

           return store.index('query').get(query);
        }).then( RateObj => { 
                   const exchangeRate  = RateObj.rate;
                   this.fetchStatus.fetchedExRateFromCacheErrStatus = 200; // set exchange rate cache flag: this means rate was found

                    return exchangeRate; // return the currency rate value
         }).catch(error => {
             //console.log('Sorry! No rate was found in the cache:');
            this.fetchStatus.fetchedExRateFromCacheErrStatus = 404; // unset exchange rate cache flag: no exchange rate was found
             return error;
        });
    }
    //+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    // method that gets all cached currencies and display them on select field through appendCurrenciesToHTMLSelectFieldss method.
    showCachedCurrencies() {
        return this.dbPromise.then( db => {

            if (!db) return;
        
            let index = db.transaction('currencies')
              .objectStore('currencies').index('id');
        
            return index.getAll().then( currencies => {
                console.log('Currencies fetched from cache');
                /* before displaying fetched currencies from cache, check if currencies from network has been displayed
                    if not, go ahead and display cached currencies*/
                if(!this.fetchStatus.fetchedCurFromNetwork){
                     // display fected currencies in currency selection fields of html page
                    this.appendCurrenciesToHTMLSelectFields(currencies); // call to the method adds currencies to select fieldss.
                }
            });
          });
    }
    //+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    /* ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
     method that fetches the list of available currencies from the api online
    */
    getAllCurrencies() {
        // Attempt to fetch currencies from cache and from network simultaneously.
        //fetch currencies from cache and display on page
        this.showCachedCurrencies(); // call to method that gets currencies from cache and renders it on the page.
        
        // fetch currencies from network also and update the page and the cache if fetched
        fetch('https://free.currencyconverterapi.com/api/v5/currencies').then(response => {
            return response.json();
        }).then(response => {
            let currencies = Object.values(response.results);
            // display fected currencies in currency selection fields of html page
            this.appendCurrenciesToHTMLSelectFields(Object.values(currencies)); // call to method that displays currencies 
            this.fetchStatus.fetchedCurFromNetwork = true; // set flag to true, currency was fetched from network
            // add the currencies to cache
            this.addCurrenciesToCache(currencies); // call to the method that stores returned currencies to cache.
            
           
        }).catch( error => {
            console.log('It looks like your are offline or have a bad network: '+ error); 
        });
    }
    //++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    // Method that displays messages and results on the index pages
    postToHTMLPage(wht, msg, outputResult = {}) {
       if(wht === 'result') { // show result after conversion
            document.getElementById('result').innerHTML = `${outputResult.toCurrency} ${outputResult.result.toFixed(2)}`;
        }
        else if(wht === 'offlineFailure' && this.fetchStatus.fetchedExRateFromCacheErrStatus !== 200) {
            document.getElementById('result').innerHTML = '0.00';
            document.getElementById('alert').innerHTML = msg;
        }

        if(msg !== '' && wht !== 'offlineFailure'){
            // show user that he is online or offline.
            document.getElementById('alert').innerHTML = msg;
        }
        return;
    }
    /* ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
     method that calls the currency api for conversion rate.
    */
    getConversionRate(fromCurrency, toCurrency, amount) {
        fromCurrency = encodeURIComponent(fromCurrency);
        toCurrency = encodeURIComponent(toCurrency);
        let query = fromCurrency + '_' + toCurrency;

        // Attempt to fetch currency exchange rate from cache and from network simultaneously.
        //fetch currency exchange rate from cache for calculation
        this.fetchStatus.fetchedExRateFromCacheErrStatus = 0; // set flag to 0: this means a request to fetch rate from cache has been initiated
        this.getCurrencyRateFromCache(fromCurrency, toCurrency).then( currencyRate => {
            
             /* before performing exchange calculation, check if exchange rate from network has been fetched and calculation performed
                    if not, go ahead and perform exchange calculation with rate from catch*/
            if(!this.fetchStatus.fetchedExRateFromNetwork && this.fetchStatus.fetchedExRateFromCacheErrStatus !== 404){
                if(this.fetchStatus.fetchedExRateFromCacheErrStatus === 200) // perform exchange calculation if exchange rate was returned from cache
                {
                     this.proccessExchange(amount, currencyRate, toCurrency); // perform exchange calculation and diplay in html
                 }
            }
        });

        this.fetchStatus.fetchedExRateFromNetwork = false; //set network fetch status to false. 
        // fetch currency exchange rate from network also and update the page and the cache if fetched
        fetch('https://free.currencyconverterapi.com/api/v5/convert?q='+ query + '&compact=ultra').then(response => {
            return response.json();
        }).then(response => {
            const currencyRate = response[Object.keys(response)]; // get the exchange rate 
            //console.log('rate gotten from network');
            this.proccessExchange(amount, currencyRate, toCurrency); // perform exchange calculation and display the result
           
           this.addCurrencyRateToCache(currencyRate, fromCurrency, toCurrency); // update cache with exchange rate obtained from api
           this.fetchStatus.fetchedExRateFromNetwork = true;
        }).catch(error => {
            this.postToHTMLPage('offlineFailure', 'It looks like you are offline. Go online to fully experience the functionalities of this app.');
           /* currency rate was gotten from cache*/
        });
    }
    /* ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
    Method that performs exchange calculation*/
    proccessExchange(amount, rate, toCurrency) {
       if(rate !== undefined)
       {
           const result = amount * rate; // performs currency convertion
       
           // set conversion exchange rate msg.
           let msg = "Exchange rate : " + rate;
           this.postToHTMLPage('result', msg, {result, toCurrency}); // call to method that handles dom communication.
       }
       else this.postToHTMLPage('msg', 'You are offline. Go online to fully experience the functionalities of this app.');
       
    }
     /* ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
         method that handles fetched currencies and adds it to html select fields*/
    appendCurrenciesToHTMLSelectFields(currencies) {

        let selectFields = document.querySelectorAll('select.currency');
        selectFields[0].options.length = 0; // clear the content of from currency select field
        selectFields[1].options.length = 0; // clear the content of to currency select fields

        //loop through the returned currencies from the api
        for(const currency of currencies){
            let optionElement = document.createElement('option');
            if(currency.hasOwnProperty('currencySymbol')) optionElement.text = `${currency.currencyName} (${currency.currencySymbol})`;
            else optionElement.text = `${currency.currencyName} (${currency.id})`;
                optionElement.value = currency.id;

             //add currency to the select field
             let optionElement2 = optionElement.cloneNode(true); // clone option element 
             // add element (option element with currency name) to parent alement(select field)
             selectFields[0].appendChild(optionElement);
             selectFields[1].appendChild(optionElement2);

             //this.appendElement(selectFields,option);
        }
        return;
    }
     /* ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++*/

} // close class
//+++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++




(() => {
    const converter = new CurrencyConverter(); // create an instance of CurrencyConverter class

    // add event listener to the convertion button in the index page
    document.getElementById('btnConvert').addEventListener('click', () =>{
        let msg = '';
         converter.postToHTMLPage('msg', 'conversion in progress, please wait...');
        // get form fields
        const amount = document.getElementById('amount').value;
        const fromCurrency = document.getElementById('from_cur').value;
        const toCurrency = document.getElementById('to_cur').value;
    
        // validations
        if(amount === '' || amount === 0 || isNaN(amount)) msg = 'Amount must be a number greater than 0.';
        else if(fromCurrency ==='') msg = 'Please specify the currency to convert from.';
        else if(toCurrency ==='') msg = 'Please specify the currency to convert to.';
        else if (fromCurrency === toCurrency) msg = 'Please choose a different currency to convert to.';
        else {
            // call the method that calls currency api to get conversion rate
            converter.getConversionRate(fromCurrency,toCurrency, amount);
        }
    
       if(msg !== '') converter.postToHTMLPage('msg', msg); // call to method that handles dom communication.  
    });


})();
/* ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++ */
