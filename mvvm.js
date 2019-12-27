class Vue {
    constructor({el, data, computed, methods}) {
        this.watcher = new Watcher();
        //computed只是把数据挂到this上 其属性改变自身不会触发更新，它依赖计算数据触发更新。因此 computed可以缓存
        this.data = data;
        this.computed = computed;
        this.methods = methods;
        this._init();
        new Hijack({el, data, vm: this});
    }

    _init() {
        //使用this代理this.data,当访问this.xxx时则去访问this.data.xxx
        for (let key in this.data) {
            Object.defineProperty(this, key, {
                enumerable: true,
                get() {
                    return this.data[key]
                },
                set(newVal) {
                    this.data[key] = newVal;
                }
            })
        }
        this._initComputed();
        this._initMethods();
    }

    _initComputed() {
        let that = this;
        //获取computed对象里的所有属性
        let computed = Reflect.ownKeys(this.computed);
        //将computed对象里的所有属性挂载到this上
        computed.forEach((key) => {
            let val = this.computed[key];
            Object.defineProperty(that, key, {
                //当属性值是方法时直接返回该值否则就是对象则返回对象的get方法
                get: typeof val == 'function' ? val : val.get,
                set() {
                }
            })
        })
    }

    _initMethods() {
        let that = this;
        //获取computed对象里的所有属性
        let method = Reflect.ownKeys(this.methods);
        //将computed对象里的所有属性挂载到this上
        method.forEach((key) => {
            let val = this.methods[key];
            Object.defineProperty(that, key, {
                //当属性值是方法时直接返回该值否则就是对象则返回对象的get方法
                get: typeof val == 'function' ? val : val.get,
                set() {
                }
            })
        })
    }

}

// 数据劫持
class Hijack {
    constructor({el, data, vm}) {
        this.el = document.querySelector(el);
        /*给data对象的每个属性添加数据劫持
        1.新增的data中不存在的属性是没有响应式更新的
        2.由于每次给data的属性赋值为一个新对象都会为这个对象新增数据劫持，因此是深度响应
        */
        this.vm = vm;
        this.observe(data);
        this.watcher = new Watcher();
        this.compile();
    }

    /* 给data对象的每个属性添加数据劫持
     * 1.新增的data中不存在的属性是没有响应式更新的
     * 2.由于每次给data的属性赋值为一个新对象都会为这个对象新增数据劫持，因此是深度响应
     */

    //数据劫持
    observe(data) {
        let that = this;
        //1.遍历出data对象上的所有属性
        for (let key in data) {
            let val = data[key];
            if (typeof val == 'object')
            //(2).如果属性值也是一个对象 则给这个对象也增加数据劫持
                this.observe(val);
            //(3).为每个属性增加数据劫持
            Object.defineProperty(data, key, {
                enumerable: true,
                //获取data[key]时直接返回其对应的val
                get() {
                    return val
                },
                //更改data[key]时
                set(newVal) {
                    //更改的值跟旧值不同时
                    if (newVal !== val) {
                        //a. 将新值覆盖旧值
                        val = newVal;
                        //b.触发事件监听
                        that.watcher.notify();
                        //c.如果新的值是一个对象 则给这个对象也增加数据劫持
                        if (typeof val == 'object')
                            that.observe(val);
                    }
                }
            })
        }
        //2.返回data
        return data;
    }

    //编译DOM
    compile() {
        //1.创建一个文档片段
        let fragment = document.createDocumentFragment();
        //2.将el中的DOM节点一个一个移入到创建的文档片段里（内存中）
        while (this.el.firstChild) {
            fragment.appendChild(this.el.firstChild);
        }
        //3.将文档片段中的{{xxx}}替换为this.data.xxx对应的值
        this.replace(fragment);
        //4.将编译好的文档片段挂载到#app上
        this.el.appendChild(fragment);
    }

    //渲染视图
    replace(fragment) {
        let nodeType = {
            //元素节点
            1: {
                type: 'element',
                fn: (node) => {
                    //拿到节点的所有属性
                    Array.from(node.attributes).forEach((attr) => {
                        if (attr.name.indexOf('v-') == 0) {
                            let textArr = attr.value.split('.');
                            let val = this.vm;
                            textArr.forEach((key) => {
                                val = val[key]
                            });
                            //添加订阅者
                            this.watcher.addSub(this.vm, attr.value, (newVal) => {
                                node.value = newVal;
                            });
                            node.value = val;
                            if (attr.name.indexOf('v-model') >= 0) {
                                node.addEventListener('input', (e) => {
                                    this.vm[attr.value] = e.target.value;
                                })
                            }
                        }
                        if (attr.name.indexOf('@') == 0) {
                            let eventName = attr.name.split('@')[1];
                            let reg = /\((.*)\)/;
                            let methodName = attr.value.split('(')[0];
                            reg.test(attr.value);
                            let param = RegExp.$1.split(')')[0];
                            let event = this.vm.methods[methodName];
                            node.addEventListener(eventName, event.bind(this.vm, param))
                        }
                    })
                }
            },
            //文本节点
            3: {
                type: 'text',
                fn: (node) => {
                    let text = node.textContent;
                    let reg = /\{\{(.*)\}\}/;
                    if (reg.test(text)) {
                        let textArr = RegExp.$1.split('.');
                        let val = this.vm;
                        textArr.forEach((key) => {
                            val = val[key]
                        });
                        //添加订阅者
                        this.watcher.addSub(this.vm, RegExp.$1, (newVal) => {
                            node.textContent = text.replace(reg, newVal);
                        });
                        node.textContent = text.replace(reg, val);
                    }
                }
            }
        };
        //1.循环文档片段的每一层节点
        Array.from(fragment.childNodes).forEach((node) => {
            nodeType[node.nodeType].fn(node);
            if (node.childNodes) {
                this.replace(node);
            }
        });
    }
}

//发布——订阅
class Watcher {
    constructor() {
        //订阅者集合
        this.subs = [];
    }

    // 添加订阅
    addSub(vm, exp, fn) {
        let update = () => {
            let textArr = exp.split('.');
            let val = vm;
            textArr.forEach((key) => {
                val = val[key];
            });
            fn(val);
        };
        this.subs.push({update});
    }

    //发布所有订阅
    notify() {
        this.subs.forEach(sub => sub.update());
    }

}

