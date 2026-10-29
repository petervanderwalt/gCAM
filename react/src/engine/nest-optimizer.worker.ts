import { NestSearch, type NestSearchRequest } from '../lib/nest-search';

self.onmessage = (event: MessageEvent<NestSearchRequest>) => {
    try {
        const search = new NestSearch(event.data);
        self.postMessage({
            result: search.best,
            area: search.bestArea,
            length: search.bestLength,
            iterations: 0,
        });
        let lastUpdate = performance.now();
        let lastAttemptUpdate = lastUpdate;
        const iterate = () => {
            try {
                const improved = search.step();
                if (improved || performance.now() - lastUpdate >= 250) {
                    lastUpdate = performance.now();
                    const showAttempt = lastUpdate - lastAttemptUpdate >= 250;
                    if (showAttempt) lastAttemptUpdate = lastUpdate;
                    self.postMessage({
                        attempt: showAttempt ? search.lastAttempt : undefined,
                        attemptIteration: search.lastAttemptIteration,
                        result: search.best,
                        area: search.bestArea,
                        length: search.bestLength,
                        iterations: search.iterations,
                    });
                }
                setTimeout(iterate, 0);
            } catch (error) {
                self.postMessage({
                    error:
                        error instanceof Error ? error.message : String(error),
                });
            }
        };
        setTimeout(iterate, 0);
    } catch (error) {
        self.postMessage({
            error: error instanceof Error ? error.message : String(error),
        });
    }
};
