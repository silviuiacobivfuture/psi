<?php
/**
 * The estate's look on the webmail: one stylesheet (estate.css) after the skin's own, and the
 * estate's mark (logo.svg, see estate.php). SEB ships both empty; an estate's layer replaces
 * them (components/estate/stalwart, ConfigMap webmail-theme).
 */
class estate_theme extends rcube_plugin
{
    public $task = '.*';

    public function init()
    {
        $this->include_stylesheet('estate.css');
    }
}
