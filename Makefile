SHELL=/bin/bash

local: local-index local-codec-registry local-avc-codec-registration

local-index: index.src.html
	bikeshed -f spec index.src.html index.html

local-codec-registry: codec_registry.src.html
	bikeshed --die-on=warning spec codec_registry.src.html codec_registry.html

local-avc-codec-registration: avc_codec_registration.src.html
	bikeshed --die-on=warning spec avc_codec_registration.src.html avc_codec_registration.html

remote-index: index.src.html
	@ (HTTP_STATUS=$$(curl https://api.csswg.org/bikeshed/ \
	                       --output index.html \
	                       --write-out "%{http_code}" \
	                       --header "Accept: text/plain, text/html" \
	                       -F die-on=warning \
	                       -F file=@index.src.html) && \
	[[ "$$HTTP_STATUS" -eq "200" ]]) || ( \
		echo ""; cat index.html; echo ""; \
		rm -f index.html; \
		exit 22 \
	);

remote-codec-registry: codec_registry.src.html
	@ (HTTP_STATUS=$$(curl https://api.csswg.org/bikeshed/ \
	                       --output codec_registry.html \
	                       --write-out "%{http_code}" \
	                       --header "Accept: text/plain, text/html" \
	                       -F die-on=warning \
	                       -F file=@codec_registry.src.html) && \
	[[ "$$HTTP_STATUS" -eq "200" ]]) || ( \
		echo ""; cat codec_registry.html; echo ""; \
		rm -f codec_registry.html; \
		exit 22 \
	);

remote-avc-codec-registration: avc_codec_registration.src.html
	@ (HTTP_STATUS=$$(curl https://api.csswg.org/bikeshed/ \
	                       --output avc_codec_registration.html \
	                       --write-out "%{http_code}" \
	                       --header "Accept: text/plain, text/html" \
	                       -F die-on=warning \
	                       -F file=@avc_codec_registration.src.html) && \
	[[ "$$HTTP_STATUS" -eq "200" ]]) || ( \
		echo ""; cat avc_codec_registration.html; echo ""; \
		rm -f avc_codec_registration.html; \
		exit 22 \
	);


remote: remote-index remote-codec-registry remote-avc-codec-registration

ci: index.src.html codec_registry.src.html avc_codec_registration.src.html
	mkdir -p out
	make remote
	mv index.html out/index.html
	mv codec_registry.html out/codec_registry.html
	mv avc_codec_registration.html out/avc_codec_registration.html
