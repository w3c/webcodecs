SHELL=/bin/bash

local: index.src.html
	bikeshed --die-on=warning spec index.src.html index.html

index.html: index.src.html
	@ (HTTP_STATUS=$$(curl https://api.csswg.org/bikeshed/ \
	                       --output index.html \
	                       --write-out "%{http_code}" \
	                       --header "Accept: text/plain, text/html" \
	                       -F file=@index.src.html) && \
	[[ "$$HTTP_STATUS" -eq "200" ]]) || ( \
		echo ""; cat index.html; echo ""; \
		rm -f index.html; \
		exit 22 \
	);

remote: index.html

ci: index.src.html
	mkdir -p out
	make remote
	mv index.html out/index.html

clean:
	rm index.html
	rm -rf out

